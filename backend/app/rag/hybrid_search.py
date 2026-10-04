"""hybrid_search.py
----------------
Hybrid document retrieval combining BM25 keyword search and FAISS semantic search.

Flow:
  1. FAISS similarity search retrieves semantically similar document chunks.
  2. BM25 (rank-bm25) retrieves exact keyword / term-matching document chunks.
  3. Results are combined, deduplicated, and scoped to the requested user/system/module.
"""

import logging
import re
from typing import List, Optional, Tuple, Dict
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)

HYBRID_TOP_K = 10

# Per-scope cache for BM25: (user_id, prompt_system_id, module_id) -> (bm25_index, chunks)
_scoped_bm25_cache: Dict[Tuple[int, int, Optional[int]], Tuple[BM25Okapi, List[Document]]] = {}


def tokenize(text: str) -> List[str]:
    """Tokenize text into lowercase alphanumeric words."""
    if not text:
        return []
    return re.findall(r"\w+", text.lower())


def get_chunks_from_vectorstore(vectorstore) -> List[Document]:
    """Extract all Document chunks stored in the FAISS vectorstore's in-memory docstore."""
    if vectorstore is None:
        return []

    docstore = getattr(vectorstore, "docstore", None)
    if docstore is None:
        return []

    doc_dict = getattr(docstore, "_dict", {})
    return list(doc_dict.values())


def reset_bm25_cache(user_id: Optional[int] = None, prompt_system_id: Optional[int] = None, module_id: Optional[int] = None) -> None:
    """Clear BM25 cache for a specific scope or all scopes."""
    global _scoped_bm25_cache
    if user_id is not None and prompt_system_id is not None:
        key = (user_id, prompt_system_id, module_id)
        _scoped_bm25_cache.pop(key, None)
        logger.info(f"BM25 cache cleared for scope {key}.")
    else:
        _scoped_bm25_cache.clear()
        logger.info("Global BM25 cache cleared.")


def build_bm25_index(chunks: List[Document]) -> BM25Okapi:
    """Build a BM25Okapi index from a list of Document chunks."""
    if not chunks:
        raise ValueError("Cannot build BM25 index from empty chunks.")

    corpus = [tokenize(doc.page_content) for doc in chunks]
    return BM25Okapi(corpus)


def get_or_build_scoped_bm25(
    vectorstore,
    user_id: int,
    prompt_system_id: int,
    module_id: Optional[int] = None,
) -> Tuple[Optional[BM25Okapi], List[Document]]:
    """Retrieve or build a cached BM25 index for a specific tenant scope."""
    global _scoped_bm25_cache
    key = (user_id, prompt_system_id, module_id)

    if key in _scoped_bm25_cache:
        return _scoped_bm25_cache[key]

    chunks = get_chunks_from_vectorstore(vectorstore)
    if not chunks:
        return None, []

    try:
        bm25 = build_bm25_index(chunks)
        _scoped_bm25_cache[key] = (bm25, chunks)
        logger.info(f"BM25 index built for scope {key} with {len(chunks)} chunks.")
        return bm25, chunks
    except Exception as error:
        logger.warning(f"Failed to build BM25 index for scope {key}: {error}")
        return None, []


def bm25_search(
    query: str,
    bm25: Optional[BM25Okapi],
    doc_chunks: List[Document],
    k: int = HYBRID_TOP_K,
) -> List[Document]:
    """Retrieve top-k chunks using BM25 keyword matching."""
    if not query or not query.strip() or bm25 is None or not doc_chunks:
        return []

    tokenized_query = tokenize(query)
    if not tokenized_query:
        return []

    scores = bm25.get_scores(tokenized_query)
    query_terms = set(tokenized_query)

    matching_chunks = []
    for doc, score in zip(doc_chunks, scores):
        doc_terms = set(tokenize(doc.page_content))
        overlap = len(query_terms.intersection(doc_terms))
        if score > 0.0 or overlap > 0:
            effective_score = float(score) if score > 0.0 else (overlap * 0.1)
            matching_chunks.append((doc, effective_score))

    matching_chunks.sort(key=lambda item: item[1], reverse=True)
    return [doc for doc, _ in matching_chunks[:k]]


def faiss_search(
    vectorstore,
    query: str,
    k: int = HYBRID_TOP_K,
) -> List[Document]:
    """Retrieve top-k chunks using FAISS dense similarity search."""
    if vectorstore is None or not query or not query.strip():
        return []

    try:
        results = vectorstore.similarity_search(query.strip(), k=k)
        return results
    except Exception as error:
        logger.error(f"FAISS similarity search failed: {error}")
        return []


def deduplicate_documents(documents: List[Document]) -> List[Document]:
    """Remove duplicate chunks while preserving candidate order."""
    unique_docs: List[Document] = []
    seen = set()

    for doc in documents:
        key = (
            doc.page_content.strip(),
            doc.metadata.get("document_id"),
            doc.metadata.get("page"),
        )
        if key not in seen:
            seen.add(key)
            unique_docs.append(doc)

    return unique_docs


def hybrid_search(
    vectorstore,
    query: str,
    user_id: int,
    prompt_system_id: int,
    module_id: Optional[int] = None,
    hybrid_top_k: int = HYBRID_TOP_K,
) -> List[Document]:
    """
    Perform hybrid retrieval (FAISS semantic + BM25 keyword) scoped strictly to
    (user_id, prompt_system_id, module_id).
    """
    if vectorstore is None or not query or not query.strip():
        return []

    clean_query = query.strip()

    # 1. FAISS dense semantic search
    faiss_docs = faiss_search(vectorstore, clean_query, k=hybrid_top_k)

    # 2. BM25 keyword search
    bm25, doc_chunks = get_or_build_scoped_bm25(vectorstore, user_id, prompt_system_id, module_id)
    bm25_docs = bm25_search(clean_query, bm25, doc_chunks, k=hybrid_top_k)

    # 3. Interleave results
    combined_candidates: List[Document] = []
    max_len = max(len(faiss_docs), len(bm25_docs))
    for i in range(max_len):
        if i < len(faiss_docs):
            combined_candidates.append(faiss_docs[i])
        if i < len(bm25_docs):
            combined_candidates.append(bm25_docs[i])

    # 4. Deduplicate
    unique = deduplicate_documents(combined_candidates)

    # 5. Strict scope filtering (safety invariant)
    scoped_unique = [
        d for d in unique
        if d.metadata.get("user_id") == user_id
        and d.metadata.get("prompt_system_id") == prompt_system_id
        and d.metadata.get("module_id") == module_id
    ]

    return scoped_unique
