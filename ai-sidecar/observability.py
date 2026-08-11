"""Structured logging and token cost tracking for AI executions.

Provides JSON-formatted audit logs and token consumption estimation per workspace,
enabling cost governance and observability across AI tiers (Fast / Strong).

Optionally also emits LangChain traces to a self-hosted Langfuse instance. That
path is strictly additive — the structured logs and token accounting below stay
authoritative whether or not Langfuse is configured or reachable.
"""
import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional
import requests
from config import (
    BACKEND_URL,
    LANGFUSE_HOST,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
    internal_headers,
    langfuse_enabled,
)

# Configure JSON structured logger
logger = logging.getLogger("septimus_ai_sidecar")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

# Estimated pricing per 1M tokens in USD ($)
COST_PER_MILLION: Dict[str, Dict[str, float]] = {
    "gpt-5": {"prompt": 2.50, "completion": 10.00},
    "gpt-5-mini": {"prompt": 0.15, "completion": 0.60},
    "gemini-2.5-pro": {"prompt": 1.25, "completion": 5.00},
    "gemini-2.5-flash": {"prompt": 0.075, "completion": 0.30},
    "claude-sonnet-4-20250514": {"prompt": 3.00, "completion": 15.00},
    "claude-3-5-haiku-20241022": {"prompt": 0.80, "completion": 4.00},
    "claude-sonnet-5": {"prompt": 3.00, "completion": 15.00},
    "claude-opus-3-7": {"prompt": 15.00, "completion": 75.00},
    # Every id in providers.MODEL_TIERS must appear here or the cost dashboard
    # silently bills it at the generic fallback rate. claude-haiku-4-5 is the
    # default Anthropic *fast* tier — the highest-volume model in the system —
    # and was being costed at 6x its real prompt price.
    "claude-haiku-4-5-20251001": {"prompt": 1.00, "completion": 5.00},
    "claude-opus-4-8": {"prompt": 5.00, "completion": 25.00},
    # Locally hosted: no per-token vendor charge.
    "llama3.2:3b": {"prompt": 0.0, "completion": 0.0},
    "qwen3:8b": {"prompt": 0.0, "completion": 0.0},
    "nomic-embed-text": {"prompt": 0.0, "completion": 0.0},
}


# Models seen without a price entry — logged once each, not per call.
_unpriced_models_seen: set = set()


def log_event(
    event_type: str,
    workspace_id: str,
    message: str,
    extra: Optional[Dict[str, Any]] = None,
):
    """Log a structured JSON event to stdout."""
    payload = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event_type": event_type,
        "workspace_id": workspace_id,
        "message": message,
        "service": "ai-sidecar",
    }
    if extra:
        payload["data"] = extra
    logger.info(json.dumps(payload, ensure_ascii=False))


def estimate_cost_usd(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate approximate cost in USD for a token usage event.

    An unlisted model falls back to a generic rate, which quietly produces wrong
    figures on the cost dashboard — so the miss is logged, making "add the new
    model to COST_PER_MILLION" a visible task rather than a silent inaccuracy.
    """
    rates = COST_PER_MILLION.get(model_name)
    if rates is None:
        if model_name and model_name not in _unpriced_models_seen:
            _unpriced_models_seen.add(model_name)
            log_event("ai.cost.unpriced_model", "",
                      f"No pricing for {model_name!r}; estimating at the generic rate. "
                      f"Add it to COST_PER_MILLION.")
        rates = {"prompt": 1.0, "completion": 3.0}
    cost_prompt = (prompt_tokens / 1_000_000.0) * rates["prompt"]
    cost_completion = (completion_tokens / 1_000_000.0) * rates["completion"]
    return round(cost_prompt + cost_completion, 6)


def track_llm_usage(
    workspace_id: str,
    provider: str,
    model_name: str,
    prompt_tokens: int,
    completion_tokens: int,
    task_tier: str = "strong",
):
    """Track and log LLM token usage and estimated cost for a workspace."""
    total_tokens = prompt_tokens + completion_tokens
    cost_usd = estimate_cost_usd(model_name, prompt_tokens, completion_tokens)

    # Shared daily counter (Redis, memory fallback) — see _add_tokens.
    _add_tokens(workspace_id, total_tokens)

    usage_data = {
        "provider": provider,
        "model": model_name,
        "task_tier": task_tier,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_usd": cost_usd,
    }

    log_event("ai.token.consumption", workspace_id, f"LLM Call [{model_name}] consumed {total_tokens} tokens (${cost_usd})", usage_data)

    # Persist the usage event to the Go backend so the cost dashboard
    # (GET /reports/ai/cost) can aggregate it durably. Best-effort: never block
    # inference if the endpoint is unreachable.
    try:
        requests.post(
            f"{BACKEND_URL}/internal/ai/usage",
            json={
                "workspace_id": workspace_id,
                "provider": provider,
                "model": model_name,
                "tier": task_tier,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated_cost_usd": cost_usd,
            },
            headers=internal_headers(workspace_id),
            timeout=3,
        )
    except Exception as e:
        # Don't block inference if the usage sink is unavailable.
        log_event("ai.token.audit_failed", workspace_id, f"Could not post token usage to Go backend: {e}")


def _provider_from_model(model: str) -> str:
    """Best-effort provider label from a model id (used when the caller doesn't
    pass an explicit provider)."""
    m = (model or "").lower()
    if "claude" in m:
        return "anthropic"
    if "gemini" in m:
        return "gemini"
    if "gpt" in m or m.startswith(("o1", "o3", "o4")):
        return "openai"
    if any(x in m for x in ("qwen", "llama", "mistral", "phi", "gemma", "deepseek")):
        return "ollama"
    return "unknown"


def _usage_from_llm_result(result: Any) -> tuple:
    """Extract (input_tokens, output_tokens, model) from a LangChain LLMResult.
    Reads standardized `usage_metadata` on chat generations first, then falls
    back to provider-specific `llm_output.token_usage`."""
    inp = out = 0
    model = ""
    try:
        for gens in (getattr(result, "generations", None) or []):
            for gen in gens:
                msg = getattr(gen, "message", None)
                if msg is None:
                    continue
                um = getattr(msg, "usage_metadata", None) or {}
                inp += int(um.get("input_tokens", 0) or 0)
                out += int(um.get("output_tokens", 0) or 0)
                md = getattr(msg, "response_metadata", None) or {}
                if not model:
                    model = md.get("model_name") or md.get("model") or ""
        if inp == 0 and out == 0:
            lo = getattr(result, "llm_output", None) or {}
            tu = lo.get("token_usage") or lo.get("usage") or {}
            inp = int(tu.get("prompt_tokens", tu.get("input_tokens", 0)) or 0)
            out = int(tu.get("completion_tokens", tu.get("output_tokens", 0)) or 0)
            if not model:
                model = lo.get("model_name") or lo.get("model") or ""
    except Exception:
        pass
    return inp, out, model


def make_usage_callback(workspace_id: str, provider: str, task_tier: str = "strong"):
    """Return a LangChain callback that records the token usage of every LLM
    call on the model it is attached to — so a single attachment in
    `get_active_llm` covers all inference paths (chat, subtasks, correspondence,
    NATS agents, …). Returns None if callbacks are unavailable. Never raises
    into inference. Zero-token calls are skipped."""
    try:
        from langchain_core.callbacks import BaseCallbackHandler
    except Exception:
        return None

    class _UsageTrackingCallback(BaseCallbackHandler):
        def on_llm_end(self, response, **kwargs):
            try:
                inp, out, model = _usage_from_llm_result(response)
                if inp == 0 and out == 0:
                    return
                prov = provider or _provider_from_model(model)
                track_llm_usage(workspace_id, prov, model or "unknown", inp, out, task_tier)
            except Exception as e:
                log_event("ai.usage.record_failed", workspace_id or "", f"callback usage: {e}")

    return _UsageTrackingCallback()


class BudgetExceededError(Exception):
    """Raised when a workspace exceeds its daily token or cost budget."""
    pass


# Daily token counters.
#
# These lived in a plain process dict, which meant the "budget guardrail" reset
# to zero on every sidecar restart, counted separately in each replica, and grew
# one key per workspace per day forever. Redis makes the counter shared and
# durable, with a TTL so yesterday's keys expire themselves. The in-memory dict
# stays as the fallback for when Redis is unavailable — degraded, but never a
# hard failure on the inference path.
_daily_token_tracker: Dict[str, int] = {}

_COUNTER_TTL_SECONDS = 60 * 60 * 36  # comfortably past a day, in any timezone
_redis_client = None
_redis_checked = False


def _redis():
    """Lazy Redis handle; None when unconfigured or unreachable."""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    url = os.getenv("REDIS_URL", "")
    if not url:
        return None
    try:
        import redis as _redis_lib

        client = _redis_lib.Redis.from_url(url, socket_timeout=1, socket_connect_timeout=1)
        client.ping()
        _redis_client = client
    except Exception as e:
        log_event("ai.budget.redis_unavailable", "", f"Token counters fall back to memory: {e}")
        _redis_client = None
    return _redis_client


def _counter_key(workspace_id: str) -> str:
    return f"septimus:ai:tokens:{workspace_id}:{time.strftime('%Y-%m-%d', time.gmtime())}"


def _add_tokens(workspace_id: str, tokens: int) -> None:
    """Add to today's counter for a workspace. Never raises."""
    key = _counter_key(workspace_id)
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.incrby(key, tokens)
            pipe.expire(key, _COUNTER_TTL_SECONDS)
            pipe.execute()
            return
        except Exception as e:
            log_event("ai.budget.redis_write_failed", workspace_id, str(e))
    _daily_token_tracker[key] = _daily_token_tracker.get(key, 0) + tokens


def _tokens_used_today(workspace_id: str) -> int:
    """Today's token total for a workspace. Never raises; 0 when unknown."""
    key = _counter_key(workspace_id)
    client = _redis()
    if client is not None:
        try:
            raw = client.get(key)
            return int(raw) if raw else 0
        except Exception:
            pass
    return _daily_token_tracker.get(key, 0)


def check_budget_guardrails(workspace_id: str, lang: str = "ar", max_daily_tokens: int = 0) -> None:
    """Check whether a workspace has exceeded its daily LLM token budget.
    
    If `max_daily_tokens` is 0, we check the environment default (`AI_MAX_DAILY_TOKENS`) or Go backend.
    Raises `BudgetExceededError` if the budget is exhausted.
    """
    if not workspace_id:
        return

    # Check against daily limit (default 1,000,000 tokens per day per workspace unless overridden)
    limit = max_daily_tokens or int(os.getenv("AI_MAX_DAILY_TOKENS", "1000000"))
    if limit <= 0:
        return

    current_tokens = _tokens_used_today(workspace_id)
    if current_tokens >= limit:
        msg = (
            f"تم تجاوز سقف استهلاك التوكنات اليومي المسموح به لبيئة العمل ({limit} توكن/يوم). يرجى مراجعة إعدادات الذكاء الاصطناعي أو الانتظار لتجديد الرصيد اليومي."
            if lang == "ar"
            else f"Daily token budget exceeded for this workspace ({limit} tokens/day). Please check AI settings or wait for daily reset."
        )
        log_event("ai.budget.exceeded", workspace_id, f"Budget guardrail blocked request (used: {current_tokens}/{limit})")
        raise BudgetExceededError(msg)

    # Check with Go backend if token-gated endpoint reports budget exhaustion
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/audit/check_budget?workspace_id={workspace_id}",
            headers=internal_headers(),
            timeout=3,
        )
        if res.status_code == 429 or (res.status_code == 200 and res.json().get("exceeded", False)):
            msg = (
                "تم تجاوز الميزانية المخصصة للذكاء الاصطناعي من قبل إدارة النظام."
                if lang == "ar"
                else "AI budget exceeded as reported by system administration."
            )
            raise BudgetExceededError(msg)
    except BudgetExceededError:
        raise
    except Exception as e:
        # Don't block inference if check_budget endpoint is unreachable or unconfigured
        pass


# ── Langfuse tracing (self-hosted, optional) ──────────────────────────────────
# Tracing is a best-effort side-channel layered on top of the structured logging
# above — never a replacement for it. Every failure mode (SDK missing, bad keys,
# Langfuse container down) degrades silently to "no tracing" and is logged once,
# so an unreachable Langfuse can't spam the audit log on every single inference.
_langfuse_warning_logged = False


def _log_langfuse_once(message: str) -> None:
    """Log a Langfuse degradation once per process lifetime."""
    global _langfuse_warning_logged
    if _langfuse_warning_logged:
        return
    _langfuse_warning_logged = True
    log_event("ai.langfuse.unavailable", "", message)


def get_langfuse_handler(
    workspace_id: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
):
    """Build a Langfuse LangChain callback handler for a single agent run.

    Returns the handler when both Langfuse keys are configured, else `None`.
    Callers pass it through as `callbacks=[handler]` only when it isn't None,
    so the unconfigured path (the default) is byte-for-byte the old behaviour.

    This function never raises: a missing SDK, a malformed key, or a Langfuse
    server that is simply down all resolve to `None` rather than breaking the
    inference that the trace was only meant to observe.
    """
    if not langfuse_enabled():
        return None

    try:
        # Imported lazily: the sidecar must start and serve normally even if the
        # langfuse package isn't installed in the image.
        from langfuse.callback import CallbackHandler
    except Exception as e:
        _log_langfuse_once(f"Langfuse SDK unavailable; LLM tracing disabled: {e}")
        return None

    try:
        run_tags = ["septimus-os", "ai-sidecar"]
        if workspace_id:
            run_tags.append(f"workspace:{workspace_id}")
        if tags:
            run_tags.extend([t for t in tags if t])

        return CallbackHandler(
            public_key=LANGFUSE_PUBLIC_KEY,
            secret_key=LANGFUSE_SECRET_KEY,
            host=LANGFUSE_HOST,
            user_id=user_id or None,
            session_id=session_id or None,
            tags=run_tags,
            metadata={"workspace_id": workspace_id or ""},
        )
    except Exception as e:
        _log_langfuse_once(f"Langfuse handler construction failed; LLM tracing disabled: {e}")
        return None
