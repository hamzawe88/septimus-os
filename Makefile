.PHONY: up down build logs n8n-up n8n-down dev-go dev-ai dev-frontend test test-go test-ai test-frontend lint

# ── Full stack (Docker) ───────────────────────────────────────────────────────

up:            ## Build & start the whole stack (db, redis, nats, centrifugo, backend, sidecar, yjs, frontend, caddy)
	docker compose up -d --build

down:          ## Stop the stack (data volumes are kept)
	docker compose down

build:         ## Rebuild images without starting
	docker compose build

logs:          ## Tail logs from every service
	docker compose logs -f --tail=100

# ── n8n automation (optional overlay — see docs/N8N_AUTOMATION.md) ───────────
# Merged with the main compose so n8n shares the stack network and can call
# http://backend-core:4000 by service name.

n8n-up:        ## Start the stack + n8n (UI on http://localhost:5678)
	docker compose -f docker-compose.yml -f docker-compose.n8n.yml up -d

n8n-down:      ## Stop n8n only (the rest of the stack keeps running)
	docker compose -f docker-compose.yml -f docker-compose.n8n.yml stop n8n

# ── Per-layer dev servers (infra must be up: `make up`) ──────────────────────

dev-go:        ## Run backend-core from source
	cd backend-core && go run main.go

dev-ai:        ## Run the AI sidecar from source (expects ai-sidecar/.venv to exist)
	cd ai-sidecar && ./.venv/bin/python main.py

dev-frontend:  ## Run the Next.js dev server
	cd frontend && npm run dev

# ── Tests (mirrors .github/workflows/ci.yml) ─────────────────────────────────

test: test-go test-ai            ## Run the same suites CI runs

test-go:
	cd backend-core && go vet ./... && go test ./...

test-ai:
	cd ai-sidecar && ./.venv/bin/pytest tests/ -q

test-frontend: ## Playwright smoke test (needs the app running)
	cd frontend && npm test

lint:
	cd frontend && npx eslint src && npx tsc --noEmit
