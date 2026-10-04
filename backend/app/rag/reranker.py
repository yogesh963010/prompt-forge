"""reranker.py
-----------
Cross-Encoder reranking module for the RAG pipeline.

Scores candidate query-document pairs jointly with a pretrained CrossEncoder
model and reorders documents so that the most semantically relevant chunks
are positioned at the top before being passed to the LLM.
"""

import logging
from typing import List
from langchain_core.documents import Document

logger = logging.getLogger(__name__)

RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
FINAL_TOP_K = 4

_reranker_instance = None


def get_reranker(model_name: str = RERANKER_MODEL):
    """Return the shared CrossEncoder instance, initializing it on the first call."""
    global _reranker_instance
    if _reranker_instance is None:
        logger.info("Initializing CrossEncoder model: %s (first time only)", model_name)
        try:
            from sentence_transformers import CrossEncoder
            _reranker_instance = CrossEncoder(model_name)
            logger.info("CrossEncoder model loaded and cached successfully.")
        except Exception as error:
            logger.warning("Could not initialize CrossEncoder (%s). Reranker fallback will be used.", error)
            return None
    return _reranker_instance


def rerank_documents(
    query: str,
    documents: List[Document],
    top_k: int = FINAL_TOP_K,
) -> List[Document]:
    """Score and reorder candidate documents for a given query using the Cross-Encoder."""
    if not documents:
        return []

    if not query or not query.strip() or len(documents) <= 1:
        return documents[:top_k]

    try:
        reranker = get_reranker()
        if reranker is None:
            return documents[:top_k]

        pairs = [[query.strip(), doc.page_content] for doc in documents]
        scores = reranker.predict(pairs)

        scored_docs = list(zip(documents, scores))
        scored_docs.sort(key=lambda item: item[1], reverse=True)

        reranked = [doc for doc, _ in scored_docs[:top_k]]
        return reranked

    except Exception as error:
        logger.warning(f"Reranking fallback to original candidates: {error}")
        return documents[:top_k]
