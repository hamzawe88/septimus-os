"""Unified knowledge base (RAG) client.

Documents and entities share a single vector store — the backend's
`document_embeddings` table (Gemini, 768-dim). This module loads/splits files
locally (Python has the PDF/text loaders) but delegates embedding, storage, and
retrieval to the Go backend so there is exactly one embedding model, one
dimension, and one retrieval surface for the whole system.
"""
import os
import re
import secrets

import requests
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader

from config import BACKEND_URL, internal_headers

# Retrieved chunks are attacker-reachable: anyone who can upload a document or
# create an entity decides what text lands in the model's context. Fencing it
# keeps it in data space instead of instruction space.
FENCE_TAG = "untrusted_knowledge"
_FENCE_PATTERN = re.compile(r"</?\s*" + FENCE_TAG + r"[^>]*>", re.IGNORECASE)


def _neutralize_fence(text: str) -> str:
    """Strip any fence tag a document tries to forge so it cannot close our
    block early and continue in instruction space."""
    return _FENCE_PATTERN.sub("[filtered]", text)


def wrap_untrusted_context(chunks) -> str:
    """Fence retrieved chunks as DATA, not instructions.

    The nonce is fresh per call, so a poisoned document cannot guess the
    closing tag — its payload stays inside the block no matter what it says.
    Returns "" for an empty payload, keeping the falsy "no context" contract
    every caller already relies on.
    """
    body = "\n\n---\n\n".join(
        _neutralize_fence(c).strip() for c in (chunks or []) if c and c.strip()
    )
    if not body.strip():
        return ""
    nonce = secrets.token_hex(8)
    return (
        f'<{FENCE_TAG} nonce="{nonce}">\n'
        f"{body}\n"
        f'</{FENCE_TAG} nonce="{nonce}">'
    )


def retrieve_context(workspace_id: str, query: str, k: int = 4) -> str:
    """Return the top-k relevant chunks (documents and entities alike) for a
    workspace, via the backend's unified semantic search, fenced as untrusted
    data. Tenant-scoped; returns "" on no results / failure."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit={k}",
            headers=internal_headers(),
            timeout=10,
        )
        if res.status_code == 200:
            results = res.json().get("results", [])
            texts = [r.get("content", "") for r in results if r.get("content")]
            return wrap_untrusted_context(texts)
        print(f"[knowledge] semantic search returned {res.status_code}")
    except Exception as e:
        print(f"[knowledge] retrieval error: {e}")
    return ""


def embed_document(file_path: str, document_id: str, workspace_id: str) -> int:
    """Load, split, and index a document into the unified knowledge base.

    The file is chunked here, then the chunks are sent to the backend's
    /internal/embeddings endpoint which embeds (Gemini) and stores them in the
    same `document_embeddings` store entities use. Returns chunks indexed.
    """
    # Resolve the path relative to the backend uploads dir if needed.
    if not os.path.exists(file_path):
        file_path = os.path.join("../backend-core", file_path)
    if not os.path.exists(file_path):
        print(f"[knowledge] document file not found: {file_path}")
        return 0

    try:
        if file_path.endswith(".pdf"):
            docs = PyPDFLoader(file_path).load()
        else:
            docs = TextLoader(file_path).load()

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        splits = splitter.split_documents(docs)
        chunks = [s.page_content for s in splits if s.page_content and s.page_content.strip()]
        if not chunks:
            print("[knowledge] no text chunks extracted from document.")
            return 0

        res = requests.post(
            f"{BACKEND_URL}/internal/embeddings",
            json={
                "workspace_id": workspace_id,
                "entity_type": "document",
                "entity_id": document_id,
                "chunks": chunks,
            },
            headers=internal_headers(),
            timeout=60,
        )
        if res.status_code == 200:
            indexed = res.json().get("indexed", 0)
            print(f"[knowledge] indexed {indexed}/{len(chunks)} chunks for document {document_id}")
            return indexed
        print(f"[knowledge] embeddings endpoint returned {res.status_code}: {res.text}")
        return 0
    except Exception as e:
        print(f"[knowledge] error processing document: {e}")
        return 0


def retrieve_institutional_facts(workspace_id: str, query: str, k: int = 5) -> list[str]:
    """Retrieve top-k relevant institutional facts (`entity_type='fact'`) from pgvector."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit={k}&entity_type=fact",
            headers=internal_headers(),
            timeout=10,
        )
        if res.status_code == 200:
            results = res.json().get("results") or []
            return [r.get("content", "").strip() for r in results if isinstance(r, dict) and r.get("content")]
    except Exception as e:
        print(f"[knowledge] retrieve_institutional_facts error: {e}")
    return []


def save_fact(workspace_id: str, content: str) -> dict:
    """Save a new institutional fact/preference to long-term memory."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/internal/facts",
            json={"workspace_id": workspace_id, "content": content},
            headers=internal_headers(),
            timeout=20,
        )
        if res.status_code in (200, 201):
            return res.json()
    except Exception as e:
        print(f"[knowledge] save_fact error: {e}")
    return {}


def list_facts(workspace_id: str) -> list[dict]:
    """List all saved institutional facts for the workspace."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/facts?workspace_id={workspace_id}",
            headers=internal_headers(),
            timeout=10,
        )
        if res.status_code == 200:
            return res.json().get("facts") or []
    except Exception as e:
        print(f"[knowledge] list_facts error: {e}")
    return []


def delete_fact(fact_id: str) -> bool:
    """Delete an institutional fact by ID."""
    try:
        res = requests.delete(
            f"{BACKEND_URL}/internal/facts/{fact_id}",
            headers=internal_headers(),
            timeout=10,
        )
        if res.status_code == 200:
            return res.json().get("success", False)
    except Exception as e:
        print(f"[knowledge] delete_fact error: {e}")
    return False

