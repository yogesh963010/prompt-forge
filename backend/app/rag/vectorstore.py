"""vectorstore.py
--------------
FAISS vector store management with multi-tenant scope isolation for PromptForge.

Scope hierarchy:
  storage/vectorstore/user_{user_id}/prompt_system_{prompt_system_id}/{module_{module_id} | parent}/
"""

import os
import shutil
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any

from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS

from .embeddings import create_embeddings
from .chunks import split_documents

logger = logging.getLogger(__name__)

# Base path for vector store persistence
_backend_dir = Path(__file__).resolve().parent.parent.parent
_env_vectorstore = os.getenv("STORAGE_VECTORSTORE_DIR")
if _env_vectorstore:
    _v_path = Path(_env_vectorstore)
    BASE_VECTORSTORE_DIR = (_backend_dir / _v_path).resolve() if not _v_path.is_absolute() else _v_path.resolve()
else:
    BASE_VECTORSTORE_DIR = (_backend_dir / "storage" / "vectorstore").resolve()


def get_scope_directory(user_id: int, prompt_system_id: int, module_id: Optional[int] = None) -> Path:
    """Resolve isolated storage directory for FAISS index of a specific user, prompt system, and module."""
    user_dir = f"user_{user_id}"
    system_dir = f"prompt_system_{prompt_system_id}"
    scope_dir = f"module_{module_id}" if module_id is not None else "parent"

    target_dir = (BASE_VECTORSTORE_DIR / user_dir / system_dir / scope_dir).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def load_vectorstore(
    user_id: int, prompt_system_id: int, module_id: Optional[int] = None
) -> Optional[FAISS]:
    """Load the scoped FAISS index from disk. Returns None if no index exists."""
    scope_path = get_scope_directory(user_id, prompt_system_id, module_id)
    faiss_file = scope_path / "index.faiss"

    if not faiss_file.exists():
        return None

    try:
        embeddings = create_embeddings()
        vectorstore = FAISS.load_local(
            str(scope_path),
            embeddings,
            allow_dangerous_deserialization=True,
        )
        return vectorstore
    except Exception as error:
        logger.warning(
            f"Failed to load vector store at {scope_path}: {error}. Returning None."
        )
        return None


def save_vectorstore(
    vectorstore: FAISS, user_id: int, prompt_system_id: int, module_id: Optional[int] = None
) -> None:
    """Persist a scoped FAISS index to disk."""
    scope_path = get_scope_directory(user_id, prompt_system_id, module_id)
    vectorstore.save_local(str(scope_path))


def delete_scope_vectorstore(
    user_id: int, prompt_system_id: int, module_id: Optional[int] = None
) -> None:
    """Delete the entire FAISS index for a specific user scope."""
    scope_path = get_scope_directory(user_id, prompt_system_id, module_id)
    if scope_path.exists():
        shutil.rmtree(str(scope_path), ignore_errors=True)
        logger.info(f"Deleted vector store directory: {scope_path}")


def extract_pdf_pages_to_documents(
    file_path: str,
    metadata_base: Dict[str, Any],
) -> List[Document]:
    """Extract text from PDF page by page into LangChain Document objects."""
    from pypdf import PdfReader

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Document file not found: {file_path}")

    reader = PdfReader(str(path))
    docs: List[Document] = []

    for page_idx, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            page_meta = dict(metadata_base)
            page_meta["page"] = page_idx + 1
            docs.append(Document(page_content=text, metadata=page_meta))

    return docs


async def index_document_file(
    file_path: str,
    user_id: int,
    prompt_system_id: int,
    module_id: Optional[int],
    document_id: str,
    filename: str,
) -> int:
    """
    Process, chunk, embed, and index an uploaded document into the scoped vector store.

    Preserves metadata:
      user_id, prompt_system_id, module_id, document_id, filename, source, page
    """
    metadata_base = {
        "user_id": user_id,
        "prompt_system_id": prompt_system_id,
        "module_id": module_id,
        "document_id": document_id,
        "filename": filename,
        "source": filename,
    }

    # 1. Extract pages into Document objects
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        page_docs = extract_pdf_pages_to_documents(file_path, metadata_base)
    else:
        # Fallback for plain text files
        content = path.read_text(encoding="utf-8", errors="ignore")
        page_docs = [Document(page_content=content, metadata=metadata_base)]

    if not page_docs:
        logger.warning(f"No readable text extracted from {filename} ({document_id}).")
        return 0

    # 2. Chunk documents
    chunks = split_documents(page_docs)

    # Ensure every chunk carries the complete isolation metadata
    for chunk in chunks:
        chunk.metadata.update(metadata_base)

    # 3. Create or update scoped FAISS vectorstore
    embeddings = create_embeddings()
    existing_store = load_vectorstore(user_id, prompt_system_id, module_id)

    if existing_store is not None:
        existing_store.add_documents(chunks)
        vectorstore = existing_store
    else:
        vectorstore = FAISS.from_documents(chunks, embeddings)

    # 4. Save to isolated scope directory
    save_vectorstore(vectorstore, user_id, prompt_system_id, module_id)

    # Reset BM25 cache for this scope if imported
    try:
        from .hybrid_search import reset_bm25_cache
        reset_bm25_cache(user_id, prompt_system_id, module_id)
    except Exception:
        pass

    logger.info(
        f"[RAG INDEX] document_id={document_id} chunk_count={len(chunks)} embedding_status=success"
    )
    return len(chunks)


def delete_document_index(
    user_id: int,
    prompt_system_id: int,
    module_id: Optional[int],
    document_id: str,
) -> None:
    """
    Remove chunks belonging to a document from the scoped vectorstore.
    Rebuilds index with remaining chunks if any exist, otherwise clears index directory.
    """
    vectorstore = load_vectorstore(user_id, prompt_system_id, module_id)
    if vectorstore is None:
        return

    docstore = getattr(vectorstore, "docstore", None)
    if docstore is None:
        return

    doc_dict = getattr(docstore, "_dict", {})
    remaining_docs = [
        doc for doc in doc_dict.values()
        if doc.metadata.get("document_id") != document_id
    ]

    # Clear BM25 cache for scope
    try:
        from .hybrid_search import reset_bm25_cache
        reset_bm25_cache(user_id, prompt_system_id, module_id)
    except Exception:
        pass

    if remaining_docs:
        embeddings = create_embeddings()
        new_store = FAISS.from_documents(remaining_docs, embeddings)
        save_vectorstore(new_store, user_id, prompt_system_id, module_id)
        logger.info(f"[RAG INDEX] Re-indexed remaining {len(remaining_docs)} chunks after deleting document {document_id}.")
    else:
        delete_scope_vectorstore(user_id, prompt_system_id, module_id)
        logger.info(f"[RAG INDEX] Cleared vector store directory for scope after deleting document {document_id}.")
