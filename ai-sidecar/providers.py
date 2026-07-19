"""LLM and embeddings provider selection.

Reads the active provider/key for a workspace from the Go backend's
token-gated /internal settings, and falls back to environment variables.
"""
import os
import requests
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from config import BACKEND_URL, GOOGLE_API_KEY, OPENAI_API_KEY, internal_headers


# Default task-tier → model per provider (fallback when selectedModel is absent).
MODEL_TIERS = {
    "openai": {"fast": "gpt-5-mini", "strong": "gpt-5"},
    "gemini": {"fast": "gemini-2.5-flash", "strong": "gemini-2.5-pro"},
    "anthropic": {"fast": "claude-haiku-4-5-20251001", "strong": "claude-sonnet-5"},
    "ollama": {"fast": "llama3.2:3b", "strong": "qwen3:8b"},
}


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


def _active_provider(workspace_id: str):
    """Return the active provider dict for a workspace, or None."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/settings/ai_providers?workspace_id={workspace_id}",
            timeout=5,
            headers=internal_headers(),
        )
        if res.status_code == 200:
            for p in res.json():
                if p.get("isActive"):
                    return p
    except Exception as e:
        print(f"Error fetching AI provider settings: {e}")
    return None


async def get_active_llm(workspace_id: str, tier: str = "strong"):
    """Initialize the configured chat model for a workspace at the given task
    tier ("fast" for light/high-volume tasks, "strong" for reasoning).

    When the workspace has a `selectedModel` saved from the UI dropdown, that
    exact model ID is used. Otherwise we fall back to the built-in tier table.

    A provider marked active but missing its key is treated as unconfigured so
    we fall through to env vars (and ultimately return None → a clean "no
    provider configured" message) instead of building a client that errors
    mid-generation with 'Missing credentials'.
    """
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

    p = _active_provider(workspace_id)
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
            try:
                from langchain_ollama import ChatOllama
                return ChatOllama(model=model_id, base_url=base_url, callbacks=_cb("ollama"))
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
            from langchain_ollama import ChatOllama
            return ChatOllama(model=_model_for("ollama", tier), base_url=os.getenv("OLLAMA_BASE_URL"), callbacks=_cb("ollama"))
        except ImportError:
            pass
    return None


def get_active_embeddings(workspace_id: str):
    """Initialize the configured embeddings model for a workspace."""
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
        try:
            from langchain_ollama import OllamaEmbeddings
            return OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_BASE_URL"))
        except ImportError:
            pass
    return None

