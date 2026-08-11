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
import tempfile
import uuid

import docx2txt
import requests
from charset_normalizer import from_bytes
from langchain_text_splitters import RecursiveCharacterTextSplitter  # type: ignore
from pypdf import PdfReader

from config import BACKEND_URL, internal_headers, resolve_upload_path

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
            f"{BACKEND_URL}/internal/search/semantic",
            params={"q": query, "limit": k},
            headers=internal_headers(workspace_id),
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


def _embed_document_file(
    file_path: str,
    document_id: str,
    workspace_id: str,
    *,
    trusted_temporary_path: bool = False,
) -> int:
    """Load, split, and index a document into the unified knowledge base.

    The file is chunked here, then the chunks are sent to the backend's
    /internal/embeddings endpoint which embeds (Gemini) and stores them in the
    same `document_embeddings` store entities use. Returns chunks indexed.
    """
    # `file_path` arrives in a NATS payload, so it is caller-controlled: resolve
    # it inside the uploads root and refuse anything that escapes.
    def set_status(status: str, indexed_chunks: int = 0, error: str = "") -> None:
        try:
            response = requests.put(
                f"{BACKEND_URL}/internal/documents/{document_id}/index-status",
                json={"status": status, "indexed_chunks": indexed_chunks, "error": error[:1000]},
                headers=internal_headers(workspace_id),
                timeout=10,
            )
            if response.status_code != 200:
                print(f"[knowledge] failed to update document status: {response.status_code}")
        except Exception as status_error:
            print(f"[knowledge] status update error: {status_error}")

    resolved = (
        os.path.realpath(file_path)
        if trusted_temporary_path and os.path.isfile(file_path)
        else resolve_upload_path(file_path)
    )
    if not resolved:
        print(f"[knowledge] document file not found or outside uploads root: {file_path!r}")
        set_status("failed", error="Document file is unavailable to the indexing worker")
        return 0
    file_path = resolved

    try:
        suffix = os.path.splitext(file_path)[1].lower()
        if suffix == ".pdf":
            reader = PdfReader(file_path)
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        elif suffix == ".docx":
            text = docx2txt.process(file_path) or ""
        else:
            with open(file_path, "rb") as source:
                raw = source.read()
            detected = from_bytes(raw).best()
            text = str(detected) if detected is not None else raw.decode("utf-8", errors="replace")

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = [chunk for chunk in splitter.split_text(text) if chunk.strip()]
        if not chunks:
            print("[knowledge] no text chunks extracted from document.")
            set_status("failed", error="No indexable text was extracted from the document")
            return 0

        res = requests.post(
            f"{BACKEND_URL}/internal/embeddings",
            json={
                "workspace_id": workspace_id,
                "entity_type": "document",
                "entity_id": document_id,
                "chunks": chunks,
            },
            headers=internal_headers(workspace_id),
            timeout=60,
        )
        if res.status_code == 200:
            indexed = res.json().get("indexed", 0)
            print(f"[knowledge] indexed {indexed}/{len(chunks)} chunks for document {document_id}")
            if indexed > 0:
                set_status("ready", indexed_chunks=indexed)
                return indexed
            set_status("failed", error="The embedding service did not index any document chunks")
            return 0
        print(f"[knowledge] embeddings endpoint returned {res.status_code}: {res.text}")
        set_status("failed", error="The embedding service rejected the document")
        return 0
    except Exception as e:
        print(f"[knowledge] error processing document: {e}")
        set_status("failed", error="Document extraction or indexing failed")
        return 0


def embed_document(file_path: str, document_id: str, workspace_id: str) -> int:
    """Index a regular upload after enforcing the shared uploads-root boundary."""
    return _embed_document_file(file_path, document_id, workspace_id)


def embed_drive_document(
    drive_file_id: str,
    filename: str,
    document_id: str,
    workspace_id: str,
) -> int:
    """Fetch a selected private Drive file and index it without persisting a
    second copy. The machine endpoint validates both the internal token and the
    workspace against backend-owned Drive metadata.
    """
    try:
        uuid.UUID(drive_file_id)
        uuid.UUID(document_id)
        uuid.UUID(workspace_id)
    except (ValueError, TypeError, AttributeError):
        print("[knowledge] rejected malformed Drive indexing identifiers")
        return 0

    suffix = os.path.splitext(os.path.basename(filename))[1].lower()
    if suffix not in {".pdf", ".docx", ".txt", ".md"}:
        print(f"[knowledge] rejected non-indexable Drive extension: {suffix!r}")
        return 0

    drive_url = os.getenv("DRIVE_URL", "http://septimus-drive:4001").rstrip("/")
    max_bytes = int(os.getenv("RAG_DRIVE_MAX_BYTES", str(25 * 1024 * 1024)))
    endpoint = f"{drive_url}/api/v1/drive/internal/files/{drive_file_id}/content"

    temp_path = ""
    try:
        with requests.get(
            endpoint,
            headers=internal_headers(workspace_id),
            stream=True,
            timeout=(5, 60),
        ) as response:
            response.raise_for_status()
            declared_size = int(response.headers.get("Content-Length") or 0)
            if declared_size > max_bytes:
                raise ValueError("Drive document exceeds the RAG indexing limit")

            total = 0
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as target:
                temp_path = target.name
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("Drive document exceeds the RAG indexing limit")
                    target.write(chunk)
        return _embed_document_file(
            temp_path,
            document_id,
            workspace_id,
            trusted_temporary_path=True,
        )
    except Exception as error:
        print(f"[knowledge] failed to import Drive document: {error}")
        try:
            requests.put(
                f"{BACKEND_URL}/internal/documents/{document_id}/index-status",
                json={
                    "status": "failed",
                    "indexed_chunks": 0,
                    "error": "Drive document could not be fetched for indexing",
                },
                headers=internal_headers(workspace_id),
                timeout=10,
            )
        except Exception as status_error:
            print(f"[knowledge] failed to record Drive import failure: {status_error}")
        return 0
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def retrieve_institutional_facts(workspace_id: str, query: str, k: int = 5) -> list[str]:
    """Retrieve top-k relevant institutional facts (`entity_type='fact'`) from pgvector."""
    try:
        res = requests.get(
            f"{BACKEND_URL}/internal/search/semantic",
            params={"q": query, "limit": k, "entity_type": "fact"},
            headers=internal_headers(workspace_id),
            timeout=10,
        )
        if res.status_code == 200:
            results = res.json().get("results") or []
            return [r.get("content", "").strip() for r in results if isinstance(r, dict) and r.get("content")]
    except Exception as e:
        print(f"[knowledge] retrieve_institutional_facts error: {e}")
    return []


# Skill personas are prompt material, not knowledge. They live in the skills
# registry, which loads them from files at startup — writing them here put 128
# persona manuals into the same corpus agents search at question time, and every
# one of them is imperative second-person text ("You are the Agile Workflow
# Steward..."). A retrieved persona therefore reads as an instruction: the HR
# agent, asked about leave policy, answered as a sprint planner in Arabic.
#
# The corpus an agent retrieves from must never contain role definitions. This
# guard is the writer-side half; the reader side filters on entity_type='fact'.
_SKILL_PERSONA_MARKERS = ("skill persona:", "شخصية المهارة:")


def _is_skill_persona(content: str) -> bool:
    head = (content or "").strip()[:200].lower()
    return any(m in head for m in _SKILL_PERSONA_MARKERS)


def save_fact(workspace_id: str, content: str) -> dict:
    """Save a new institutional fact/preference to long-term memory."""
    if _is_skill_persona(content):
        print("[knowledge] refused to store a skill persona as an institutional fact")
        return {}
    try:
        res = requests.post(
            f"{BACKEND_URL}/internal/facts",
            json={"workspace_id": workspace_id, "content": content},
            headers=internal_headers(workspace_id),
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
            f"{BACKEND_URL}/internal/facts",
            headers=internal_headers(workspace_id),
            timeout=10,
        )
        if res.status_code == 200:
            return res.json().get("facts") or []
    except Exception as e:
        print(f"[knowledge] list_facts error: {e}")
    return []


def delete_fact(workspace_id: str, fact_id: str) -> bool:
    """Delete an institutional fact by ID."""
    try:
        res = requests.delete(
            f"{BACKEND_URL}/internal/facts/{fact_id}",
            headers=internal_headers(workspace_id),
            timeout=10,
        )
        if res.status_code == 200:
            return res.json().get("success", False)
    except Exception as e:
        print(f"[knowledge] delete_fact error: {e}")
    return False
