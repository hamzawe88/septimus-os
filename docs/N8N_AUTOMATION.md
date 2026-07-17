# n8n ↔ Septimus automation

n8n is an **optional overlay** on the stack. Nothing else depends on it; bring it
up only when you want workflow automation.

```bash
make n8n-up          # stack + n8n, UI on http://localhost:5678
make n8n-down        # stop n8n, leave the rest running
```

It must be merged with the main compose file (which `make n8n-up` does):

```bash
docker compose -f docker-compose.yml -f docker-compose.n8n.yml up -d
```

Running `docker-compose.n8n.yml` on its own puts n8n on an isolated network where
`backend-core` does not resolve, and every workflow that calls the API fails.

## First run

1. `make n8n-up`, open <http://localhost:5678>, create the owner account
   (n8n's own user management — the deprecated `N8N_BASIC_AUTH_*` variables are
   deliberately not used).
2. Set `N8N_ENCRYPTION_KEY` in `.env` **before** that first boot. n8n encrypts
   saved credentials with it; if it auto-generates one into the volume and the
   variable changes later, every stored credential becomes undecryptable.

## n8n → Septimus (calling the API from a workflow)

Mint a key in the app under **API Keys**, then use an **HTTP Request** node:

| Field | Value |
|-------|-------|
| URL | `http://backend-core:4000/api/public/v1/...` (service name, not `localhost`) |
| Header | `X-API-Key: <your key>` |

The key carries its workspace, so a workflow can only ever touch the workspace
that key belongs to — there is no way to widen that scope from the n8n side.

Available to API-key callers:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/public/v1/entities` | Create a record (lead, ticket, invoice, …) |
| `GET` | `/api/public/v1/entities` | Read records |
| `POST` | `/api/public/v1/agents/dispatch` | Run an AI agent (`crm` \| `task` \| `comm`) |

Dispatch body:

```json
{ "agent_type": "crm", "task": "Score the leads created today" }
```

It returns immediately with a `session_id`: the agent runs asynchronously over
NATS. Results arrive via the collaboration stream in the AI Center, or via a
webhook subscription (below) — not in the dispatch response.

## Septimus → n8n (reacting to events)

Add a **Webhook** node in n8n, copy its URL, and subscribe to workspace events:

```bash
POST /api/v1/workspaces/<workspace_id>/webhooks
{ "target_url": "http://n8n:5678/webhook/<path>", "events": ["entities.created"] }
```

Use `http://n8n:5678/...` (service name) when the subscription is delivered from
inside the stack.

## A worked example

Inbound WhatsApp message → n8n Webhook node → HTTP Request `POST
/api/public/v1/agents/dispatch` with `agent_type: "crm"` → the CRM agent scores
the lead → its write goes through the existing human-in-the-loop approval queue
→ an approved write fires `entities.created` → a second n8n Webhook node sends
the reply.

Every component in that chain already exists; n8n only wires them together.

## Security notes

- n8n's UI is bound to `127.0.0.1:5678` — same rule as the data stores. Exposing
  it publicly means exposing stored credentials behind one login.
- API keys are hashed (SHA-256) at rest and can be revoked in the app.
- Agent writes stay behind human approval regardless of who dispatched them, so
  an automation cannot silently mutate data.
