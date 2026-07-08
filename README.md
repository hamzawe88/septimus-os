# Septimus Company OS

The next-generation Company OS featuring a multi-agent AI team, Slack-like chat interface, and dynamic data entity management.

## Project Structure

- `backend-core/`: Golang Real-time & CRUD services.
- `ai-agents/`: Python FastAPI & LangGraph multi-agent orchestration.
- `frontend/`: Next.js 15 Slack-clone UI.

## Infrastructure

Run the following command to start the local infrastructure (PostgreSQL with pgvector, Redis, NATS, Centrifugo, Caddy):

```bash
docker-compose up -d
```
