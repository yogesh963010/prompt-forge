"""retriever.py
------------
Document retrieval utilities for PromptForge RAG pipeline with scope isolation.
"""

import logging
from typing import List, Optional
from langchain_core.documents import Document

from .vectorstore import load_vectorstore
from .hybrid_search import hybrid_search, HYBRID_TOP_K
from .reranker import rerank_documents, FINAL_TOP_K

logger = logging.getLogger(__name__)


def retrieve_scoped_documents(
    user_id: int,
    prompt_system_id: int,
    module_id: Optional[int],
    question: str,
    hybrid_top_k: int = HYBRID_TOP_K,
    final_top_k: int = FINAL_TOP_K,
) -> List[Document]:
    """
    Perform isolated retrieval for a question:
      1. Load scoped vector store (user_id + prompt_system_id + module_id).
      2. If no vector store exists, return empty list (normal direct LLM flow).
      3. Hybrid search (BM25 keyword + FAISS semantic search) -> candidate chunks.
      4. Cross-Encoder reranking -> top final_top_k chunks.
      5. Strict multi-tenant verification: chunks must belong to the scope.
    """
    if not question or not question.strip():
        return []

    vectorstore = load_vectorstore(user_id, prompt_system_id, module_id)
    if vectorstore is None:
        logger.info(
            f"[RAG RETRIEVAL] user_id={user_id} prompt_system_id={prompt_system_id} module_id={module_id} results=0 (no index)"
        )
        return []

    try:
        # 1. Hybrid search (BM25 + FAISS) with strict scope enforcement
        candidates = hybrid_search(
            vectorstore=vectorstore,
            query=question.strip(),
            user_id=user_id,
            prompt_system_id=prompt_system_id,
            module_id=module_id,
            hybrid_top_k=hybrid_top_k,
        )

        if not candidates:
            logger.info(
                f"[RAG RETRIEVAL] user_id={user_id} prompt_system_id={prompt_system_id} module_id={module_id} results=0"
            )
            return []

        # 2. Cross-Encoder reranking
        reranked = rerank_documents(question.strip(), candidates, top_k=final_top_k)

        # 3. Final safety check on metadata isolation
        final_docs = [
            doc for doc in reranked
            if doc.metadata.get("user_id") == user_id
            and doc.metadata.get("prompt_system_id") == prompt_system_id
            and doc.metadata.get("module_id") == module_id
        ]

        logger.info(
            f"[RAG RETRIEVAL] user_id={user_id} prompt_system_id={prompt_system_id} module_id={module_id} results={len(final_docs)}"
        )
        return final_docs

    except Exception as error:
        logger.error(f"Retrieval error for scope ({user_id}, {prompt_system_id}, {module_id}): {error}")
        return []


def get_sources_from_documents(documents: List[Document]) -> List[dict]:
    """Extract unique source filename and page from retrieved documents."""
    sources = []
    seen = set()

    for doc in documents:
        src = doc.metadata.get("filename") or doc.metadata.get("source") or "document.pdf"
        page = doc.metadata.get("page")
        key = (src, page)
        if key not in seen:
            sources.append({"source": src, "page": page})
            seen.add(key)

    return sources
