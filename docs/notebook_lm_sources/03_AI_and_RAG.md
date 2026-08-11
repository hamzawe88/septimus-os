# Septimus OS - AI Sidecar and RAG Pipeline (NotebookLM Source)

This document is compiled for NotebookLM to understand the Artificial Intelligence routing and knowledge generation layers of Septimus OS.

## 1. Multi-Tier LLM Routing
The AI Sidecar is written in Python using FastAPI. It implements a smart Multi-Tier Routing algorithm to optimize for both cost and intelligence.

- **Fast Tier**: Routes simple queries (summarization, simple translations) to cheaper, extremely fast models like `gemini-2.5-flash`, `gpt-5-mini`, or `claude-3-5-haiku`.
- **Strong Tier**: Routes complex queries (contract analysis, workflow generation, heavy code review) to large reasoning models like `gemini-2.5-pro`, `gpt-5`, or `claude-sonnet-5`.

All API keys for these providers are stored centrally in the Go backend (`settings` table) and passed securely in memory to the Python sidecar.

## 2. Semantic Search and RAG (pgvector)
To give the AI context about the specific company using it, Septimus OS uses Retrieval-Augmented Generation (RAG).

- Text extracted from user documents is chunked and embedded using an embedding model.
- These vectors are stored in the `document_embeddings` table in PostgreSQL using the `pgvector` extension.
- When a user asks a question, the Python Sidecar queries the `pgvector` index to pull the top K most semantically similar chunks and injects them into the LLM prompt.

## 3. The Proactive Auditor (Upcoming)
The roadmap includes a Proactive Auditor agent that will run continuously in the background on the Python Sidecar. It will query the `entities` table looking for anomalies (like overdue payments or unusual HR requests) and broadcast alerts to users via the real-time WebSocket (`Centrifugo`).
