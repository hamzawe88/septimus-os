"""Central configuration and service-to-service auth for the AI sidecar."""
import os
from typing import Optional

NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
DB_DSN = os.getenv("DB_DSN", "postgres://postgres:postgres@localhost:5432/septimus_db")
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
    if DEFAULT_WORKSPACE_ID:
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
CENTRIFUGO_API_KEY = os.getenv("CENTRIFUGO_API_KEY", "supersecretapikey")

# Shared service-to-service secret. The sidecar is not published on any host
# port — the only ingress is the JWT-protected proxy in the Go backend, which
# stamps this token onto forwarded requests. Outbound calls to the backend's
# /internal/* routes present the same token.
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")

CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080").split(",")
    if origin.strip()
]


def internal_headers() -> dict:
    """Headers for calls to the backend's token-gated /internal/* routes."""
    if INTERNAL_API_TOKEN:
        return {"X-Internal-Token": INTERNAL_API_TOKEN}
    return {}
