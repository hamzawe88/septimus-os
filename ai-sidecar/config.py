"""Central configuration and service-to-service auth for the AI sidecar."""
import os

NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
DB_DSN = os.getenv("DB_DSN", "postgres://postgres:postgres@localhost:5432/septimus_db")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend-core:4000")

# Fallback keys if a workspace has no active provider configured in the DB.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

DEFAULT_WORKSPACE_ID = os.getenv("DEFAULT_WORKSPACE_ID", "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")

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
