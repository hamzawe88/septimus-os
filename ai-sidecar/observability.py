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
}


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
    """Calculate approximate cost in USD for a token usage event."""
    rates = COST_PER_MILLION.get(model_name, {"prompt": 1.0, "completion": 3.0})
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

    # Track daily tokens in memory
    today_key = f"{workspace_id}_{time.strftime('%Y-%m-%d', time.gmtime())}"
    _daily_token_tracker[today_key] = _daily_token_tracker.get(today_key, 0) + total_tokens

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
            headers=internal_headers(),
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


def extract_usage_from_response(response: Any) -> Dict[str, int]:
    """Safely extract token counts from LangChain / provider response metadata."""
    prompt_tokens = 0
    completion_tokens = 0

    meta = getattr(response, "response_metadata", {})
    if not isinstance(meta, dict):
        meta = {}

    # Check standard OpenAI/Anthropic/Gemini usage block
    usage = meta.get("token_usage") or meta.get("usage") or {}
    if isinstance(usage, dict):
        prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
        completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens") or 0

    return {
        "prompt_tokens": int(prompt_tokens),
        "completion_tokens": int(completion_tokens),
        "total_tokens": int(prompt_tokens) + int(completion_tokens),
    }


class BudgetExceededError(Exception):
    """Raised when a workspace exceeds its daily token or cost budget."""
    pass


# In-memory daily usage tracking tracker: { f"{workspace_id}_{YYYY-MM-DD}": int }
_daily_token_tracker: Dict[str, int] = {}


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

    today_key = f"{workspace_id}_{time.strftime('%Y-%m-%d', time.gmtime())}"
    current_tokens = _daily_token_tracker.get(today_key, 0)
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

