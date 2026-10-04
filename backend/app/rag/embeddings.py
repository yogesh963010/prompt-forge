"""embeddings.py
-------------
HuggingFace embedding model initialization for PromptForge RAG.
Model: sentence-transformers/all-MiniLM-L6-v2 (singleton pattern).
"""

import logging
import os

logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_DIMENSION = 384

_embeddings_instance = None


def create_embeddings():
    """Return the shared embedding model instance, cached as singleton."""
    global _embeddings_instance

    if _embeddings_instance is not None:
        return _embeddings_instance

    logger.info("Loading embedding model: %s (first time only)", MODEL_NAME)

    try:
        try:
            from langchain_huggingface import HuggingFaceEmbeddings
            embeddings = HuggingFaceEmbeddings(model_name=MODEL_NAME)
        except ImportError:
            from langchain_community.embeddings import HuggingFaceEmbeddings
            embeddings = HuggingFaceEmbeddings(model_name=MODEL_NAME)

        test_vector = embeddings.embed_query("test")
        if not test_vector:
            raise ValueError("Embedding model returned an empty vector.")

        _embeddings_instance = embeddings
        logger.info("Embedding model loaded and cached successfully.")
        return _embeddings_instance

    except Exception as error:
        logger.error(f"Failed to initialize embedding model: {error}")
        raise RuntimeError(f"Failed to initialize embedding model: {error}") from error
