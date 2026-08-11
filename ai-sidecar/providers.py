"""LLM and embeddings provider selection.

Reads the active provider/key for a workspace from the Go backend's
token-gated /internal settings, and falls back to environment variables.
"""
import asyncio
import ipaddress
import os
import socket
import threading
import time
from urllib.parse import urlparse

import requests
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from config import BACKEND_URL, GOOGLE_API_KEY, OPENAI_API_KEY, internal_headers
from observability import check_budget_guardrails

# Default task-tier → model per provider (fallback when selectedModel is absent).
MODEL_TIERS = {
    "openai": {"fast": "gpt-5-mini", "strong": "gpt-5"},
    "gemini": {"fast": "gemini-2.5-flash", "strong": "gemini-2.5-pro"},
    "anthropic": {"fast": "claude-haiku-4-5-20251001", "strong": "claude-sonnet-5"},
    "ollama": {"fast": "llama3.2:3b", "strong": "qwen3:8b"},
}


# Local models have no billing ceiling, so nothing bounds how long one reply may
# run. A reasoning model (qwen3 and friends) can emit thousands of thinking
# tokens for a one-line question: the same HR question was measured at 479
# completion tokens once and 1481 the next time — 43s versus over three minutes
# through the browser, which the UI reports as "an error occurred".
#
# num_predict is a hard stop on generation, not a quality setting: replies here
# are a few hundred tokens, so this only truncates a runaway. Override with
# OLLAMA_NUM_PREDICT when a workload genuinely needs longer output.
_OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "1024"))


def _ollama_kwargs() -> dict:
    return {"num_predict": _OLLAMA_NUM_PREDICT}

def _safe_ollama_url(raw: str) -> bool:
    """Allow only explicitly permitted Ollama destinations.

    The base URL is workspace-controlled configuration, so it must not become
    a general server-side request primitive. Local/private Ollama is available
    only in the explicit development escape hatch shared with the Go service.
    """
    parsed = urlparse((raw or "").strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        return False
    allow_private = os.getenv("APP_ENV") == "development" and os.getenv("ALLOW_PRIVATE_OUTBOUND") == "true"
    if parsed.scheme != "https" and not allow_private:
        return False
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, parsed.port, type=socket.SOCK_STREAM)}
    except OSError:
        return False
    if allow_private:
        return True
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            return False
    return bool(addresses)


def _model_for(provider: str, tier: str, selected_model: str = "", provider_cfg: dict = None) -> str:
    """Return the model ID to use for a task tier.

    Priority: per-tier selection from the UI (`selectedModelFast` /
    `selectedModelStrong`) → legacy single `selectedModel` (applies to both
    tiers) → the built-in tier table.
    """
    cfg = provider_cfg or {}
    per_tier = (cfg.get("selectedModelFast") if tier == "fast" else cfg.get("selectedModelStrong")) or ""
    if per_tier.strip():
        return per_tier.strip()
    if selected_model:
        return selected_model
    table = MODEL_TIERS.get(provider, {})
    return table.get(tier, table.get("strong", ""))


# Provider settings change when an admin edits them in the UI — rarely — but
# `_active_provider` used to issue a fresh HTTP call on EVERY get_active_llm and
# get_active_embeddings. One supervisor turn that delegates twice paid three
# blocking round-trips before emitting a single token. A short TTL keeps edits
# visible within seconds while removing that cost from the hot path.
_PROVIDER_CACHE_TTL = float(os.getenv("PROVIDER_CACHE_TTL_SECONDS", "30"))
_provider_cache: dict = {}
_provider_cache_lock = threading.Lock()


def invalidate_provider_cache(workspace_id: str = "") -> None:
    """Drop cached provider settings — for one workspace, or all when empty."""
    with _provider_cache_lock:
        if workspace_id:
            _provider_cache.pop(workspace_id, None)
        else:
            _provider_cache.clear()


def _active_provider(workspace_id: str):
    """Return the active provider dict for a workspace, or None.

    Cached for `_PROVIDER_CACHE_TTL` seconds. Note this dict carries a decrypted
    apiKey, so the cache stays process-local and is never logged or persisted.
    """
    now = time.monotonic()
    with _provider_cache_lock:
        hit = _provider_cache.get(workspace_id)
        if hit and now - hit[0] < _PROVIDER_CACHE_TTL:
            return hit[1]

    result = _fetch_active_provider(workspace_id)

    # Only cache successful lookups: caching a transient backend outage as "no
    # provider configured" would leave the workspace without AI for the full TTL.
    if result is not None:
        with _provider_cache_lock:
            _provider_cache[workspace_id] = (now, result)
    return result


def _fetch_active_provider(workspace_id: str):
    """Uncached read of the workspace's active provider from the Go backend."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/settings/ai_providers",
            timeout=5,
            headers=internal_headers(workspace_id),
        )
        if res.status_code == 200:
            data = res.json()
            # Never log the payload itself: every entry carries a decrypted
            # provider apiKey, and container stdout is not a secret store.
            print(
                f"[providers] loaded {len(data)} provider(s): "
                f"{[p.get('provider') for p in data]}",
                flush=True,
            )
            for p in data:
                if p.get("isActive"):
                    print(f"[providers] active provider: {p.get('provider')}", flush=True)
                    return p
        else:
            print(f"[providers] ai_providers lookup failed with {res.status_code}", flush=True)
    except Exception as e:
        print(f"Error fetching AI provider settings: {e}")
    return None


async def get_active_llm(workspace_id: str, tier: str = "strong", enforce_budget: bool = True):
    """Initialize the configured chat model for a workspace at the given task
    tier ("fast" for light/high-volume tasks, "strong" for reasoning).

    When the workspace has a `selectedModel` saved from the UI dropdown, that
    exact model ID is used. Otherwise we fall back to the built-in tier table.

    A provider marked active but missing its key is treated as unconfigured so
    we fall through to env vars (and ultimately return None → a clean "no
    provider configured" message) instead of building a client that errors
    mid-generation with 'Missing credentials'.
    """
    if not workspace_id:
        print("[providers] refusing LLM lookup without workspace_id", flush=True)
        return None
    # Budget enforcement belongs here, at the single chokepoint every inference
    # path passes through. It used to sit in run_chat_agent alone, so 25 of the
    # 26 entry points — NATS handlers, the orchestrator, the morning auditor,
    # subtask generation — could spend without limit.
    if enforce_budget:
        check_budget_guardrails(workspace_id)

    # Attach a usage-tracking callback at construction so EVERY invocation of
    # the returned model — direct ainvoke or inside a create_react_agent — feeds
    # the cost dashboard. One attachment here covers all inference paths.
    def _cb(provider):
        try:
            from observability import make_usage_callback
            c = make_usage_callback(workspace_id, provider, tier)
            return [c] if c else None
        except Exception:
            return None

    # `_active_provider` may do a synchronous HTTP call on a cache miss. Running
    # it inline would stall the whole FastAPI event loop — every other request
    # included — for the duration of that round-trip.
    p = await asyncio.to_thread(_active_provider, workspace_id)
    if p:
        provider_name = p.get("provider")
        api_key = (p.get("apiKey") or "").strip()
        selected_model = (p.get("selectedModel") or "").strip()

        if provider_name == "openai" and api_key:
            model_id = _model_for("openai", tier, selected_model, provider_cfg=p)
            return ChatOpenAI(model=model_id, openai_api_key=api_key, callbacks=_cb("openai"))
        elif provider_name == "gemini" and (api_key or GOOGLE_API_KEY):
            model_id = _model_for("gemini", tier, selected_model, provider_cfg=p)
            return ChatGoogleGenerativeAI(model=model_id, google_api_key=api_key or GOOGLE_API_KEY, callbacks=_cb("gemini"))
        elif provider_name == "anthropic" and api_key:
            model_id = _model_for("anthropic", tier, selected_model, provider_cfg=p)
            try:
                from langchain_anthropic import ChatAnthropic
                return ChatAnthropic(model=model_id, anthropic_api_key=api_key, callbacks=_cb("anthropic"))
            except ImportError:
                print("langchain_anthropic not installed or unavailable")
        elif provider_name == "ollama":
            model_id = _model_for("ollama", tier, selected_model, provider_cfg=p)
            base_url = p.get("baseUrl") or os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
            if not _safe_ollama_url(base_url):
                print("[providers] rejected unsafe Ollama base URL", flush=True)
                return None
            try:
                from langchain_ollama import ChatOllama
                return ChatOllama(model=model_id, base_url=base_url, callbacks=_cb("ollama"), **_ollama_kwargs())
            except ImportError:
                print("langchain_ollama not installed or unavailable")

    # Fallback to env vars
    print("Falling back to environment variables for LLM")
    if GOOGLE_API_KEY:
        return ChatGoogleGenerativeAI(model=_model_for("gemini", tier), google_api_key=GOOGLE_API_KEY, callbacks=_cb("gemini"))
    elif OPENAI_API_KEY:
        return ChatOpenAI(model=_model_for("openai", tier), openai_api_key=OPENAI_API_KEY, callbacks=_cb("openai"))
    elif os.getenv("ANTHROPIC_API_KEY"):
        try:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(model=_model_for("anthropic", tier), anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"), callbacks=_cb("anthropic"))
        except ImportError:
            pass
    elif os.getenv("OLLAMA_BASE_URL"):
        try:
            if not _safe_ollama_url(os.getenv("OLLAMA_BASE_URL")):
                print("[providers] rejected unsafe Ollama environment URL", flush=True)
                return None
            from langchain_ollama import ChatOllama
            return ChatOllama(model=_model_for("ollama", tier), base_url=os.getenv("OLLAMA_BASE_URL"), callbacks=_cb("ollama"), **_ollama_kwargs())
        except ImportError:
            pass
    return None


def get_active_embeddings(workspace_id: str):
    """Initialize the configured embeddings model for a workspace."""
    if not workspace_id:
        print("[providers] refusing embedding lookup without workspace_id", flush=True)
        return None
    p = _active_provider(workspace_id)
    if p:
        provider_name = p.get("provider")
        api_key = (p.get("apiKey") or "").strip()
        if provider_name == "openai" and api_key:
            return OpenAIEmbeddings(openai_api_key=api_key)
        elif provider_name == "gemini" and (api_key or GOOGLE_API_KEY):
            return GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GOOGLE_API_KEY or api_key)
        elif provider_name == "ollama":
            base_url = p.get("baseUrl") or os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
            if not _safe_ollama_url(base_url):
                print("[providers] rejected unsafe Ollama embedding URL", flush=True)
                return None
            try:
                from langchain_ollama import OllamaEmbeddings
                return OllamaEmbeddings(model="nomic-embed-text", base_url=base_url)
            except ImportError:
                pass

    # Fallback to env vars
    if GOOGLE_API_KEY:
        return GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GOOGLE_API_KEY)
    elif OPENAI_API_KEY:
        return OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
    elif os.getenv("OLLAMA_BASE_URL"):
        if not _safe_ollama_url(os.getenv("OLLAMA_BASE_URL")):
            print("[providers] rejected unsafe Ollama embedding environment URL", flush=True)
            return None
        try:
            from langchain_ollama import OllamaEmbeddings
            return OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_BASE_URL"))
        except ImportError:
            pass
    return None
