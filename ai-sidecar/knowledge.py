"""Unified knowledge base (RAG) client.

Documents and entities share a single vector store — the backend's
`document_embeddings` table (Gemini, 768-dim). This module loads/splits files
locally (Python has the PDF/text loaders) but delegates embedding, storage, and
retrieval to the Go backend so there is exactly one embedding model, one
dimension, and one retrieval surface for the whole system.
"""
import os

import requests
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader

from config import BACKEND_URL, internal_headers


def retrieve_context(workspace_id: str, query: str, k: int = 4) -> str:
    """Return the concatenated text of the top-k relevant chunks (documents and
    entities alike) for a workspace, via the backend's unified semantic search.
    Tenant-scoped; returns "" on no results / failure."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit={k}",
            headers=internal_headers(),
            timeout=10,
        )
        if res.status_code == 200:
            results = res.json().get("results", [])
            texts = [r.get("content", "") for r in results if r.get("content")]
            return "\n\n".join(texts)
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
