"""Structured logging and token cost tracking for AI executions.

Provides JSON-formatted audit logs and token consumption estimation per workspace,
enabling cost governance and observability across AI tiers (Fast / Strong).
"""
import json
import logging
import os
import sys
import time
from typing import Any, Dict, Optional
import requests
from config import BACKEND_URL, internal_headers

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

    # Proactively send audit event to Go backend if configured
    try:
        requests.post(
            f"{BACKEND_URL}/internal/audit/log",
            json={
                "workspace_id": workspace_id,
                "action": "ai.token.usage",
                "target_type": "model",
                "target_id": model_name,
                "details": usage_data,
            },
            headers=internal_headers(),
            timeout=3,
        )
    except Exception as e:
        # Don't block inference if audit webhook fails
        log_event("ai.token.audit_failed", workspace_id, f"Could not post token usage to Go backend: {e}")


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
