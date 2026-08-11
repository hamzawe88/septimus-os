"""Central configuration and service-to-service auth for the AI sidecar."""
import os
from typing import Optional

NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
DB_DSN = os.getenv("DB_DSN", "postgres://postgres:postgres@localhost:5432/septimus_db")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend-core:4000")

# Fallback keys if a workspace has no active provider configured in the DB.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Optional explicit override; when unset, get_default_workspace_id() resolves
# the oldest workspace from the backend at first use (no hardcoded tenant id).
DEFAULT_WORKSPACE_ID = os.getenv("DEFAULT_WORKSPACE_ID", "")

_resolved_default_workspace_id: Optional[str] = None


def get_default_workspace_id() -> str:
    """Single-tenant fallback workspace id for events that carry none.

    Order: DEFAULT_WORKSPACE_ID env override → cached backend lookup
    (/internal/workspaces/default) → "" when the backend is unreachable
    (callers then simply match no tenant data instead of a wrong tenant's).
    """
    global _resolved_default_workspace_id
    if os.getenv("ALLOW_SINGLE_TENANT_DEFAULT") != "true":
        return ""
    if DEFAULT_WORKSPACE_ID and os.getenv("ALLOW_SINGLE_TENANT_DEFAULT") == "true":
        return DEFAULT_WORKSPACE_ID
    if _resolved_default_workspace_id is None:
        import requests

        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/workspaces/default",
                headers=internal_headers(),
                timeout=5,
            )
            _resolved_default_workspace_id = (
                res.json().get("workspace_id", "") if res.status_code == 200 else ""
            )
        except Exception:
            _resolved_default_workspace_id = ""
        if not _resolved_default_workspace_id:
            # Leave the cache unset so the next call retries (backend may
            # simply not be up yet during stack boot).
            result = ""
            _resolved_default_workspace_id = None
            return result
    return _resolved_default_workspace_id

# Centrifugo HTTP API — used to stream AI reply tokens to the browser as a
# realtime side-channel (the HTTP response remains the authoritative final reply).
CENTRIFUGO_API_URL = os.getenv("CENTRIFUGO_API_URL", "http://centrifugo:8000/api")
# No default: "supersecretapikey" is the published example value, so falling back
# to it turned a forgotten env var into an open publish endpoint rather than a
# broken one. Empty means realtime streaming is disabled — see realtime.publish.
CENTRIFUGO_API_KEY = os.getenv("CENTRIFUGO_API_KEY", "")

# Shared service-to-service secret. The sidecar is not published on any host
# port — the only ingress is the JWT-protected proxy in the Go backend, which
# stamps this token onto forwarded requests. Outbound calls to the backend's
# /internal/* routes present the same token.
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")

# Langfuse (self-hosted LLM tracing). Purely additive: when the two keys are
# absent — the default — tracing stays off and the agent path behaves exactly
# as before. Keys are minted in the Langfuse UI on first run (see .env.example).
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "http://langfuse:3000")


def langfuse_enabled() -> bool:
    """True only when both Langfuse keys are configured."""
    return bool(LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY)

CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080").split(",")
    if origin.strip()
]


def internal_headers(workspace_id: str = "", user_role: str = "") -> dict:
    """Headers for calls to the backend's token-gated /internal/* routes."""
    headers = {}
    if INTERNAL_API_TOKEN:
        headers["X-Internal-Token"] = INTERNAL_API_TOKEN
    if workspace_id:
        headers["X-Workspace-ID"] = workspace_id
    if user_role:
        headers["X-User-Role"] = user_role
    return headers


# Root the sidecar is allowed to read uploaded files from. Every file path we
# act on arrives in a NATS payload or an HTTP body, so it is caller-controlled.
UPLOADS_ROOT = os.path.abspath(os.getenv("UPLOADS_ROOT", "../backend-core"))


def resolve_upload_path(candidate: str) -> Optional[str]:
    """Resolve a caller-supplied file path, refusing anything outside UPLOADS_ROOT.

    Without this, `../../../etc/passwd` (or any absolute path) reached `open()`
    and its contents were shipped to a third-party API. Returns the absolute
    path when it is a real file inside the root, else None — callers treat None
    as "no such file" rather than reading whatever was asked for.
    """
    if not candidate or not candidate.strip():
        return None
    raw = candidate.strip()
    full = os.path.abspath(raw if os.path.isabs(raw) else os.path.join(UPLOADS_ROOT, raw))
    # Containment check on the normalized path: equal to the root, or beneath it.
    if full != UPLOADS_ROOT and not full.startswith(UPLOADS_ROOT + os.sep):
        print(f"[config] refused path outside uploads root: {raw!r}")
        return None
    if not os.path.isfile(full):
        return None
    return full
