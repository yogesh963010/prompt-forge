"""chunks.py
---------
Chunking utilities for PromptForge RAG documents.
"""

from typing import List, Optional, Dict, Any
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def split_documents(documents: List[Document], chunk_size: int = 800, chunk_overlap: int = 100) -> List[Document]:
    """Split LangChain Document objects into smaller chunks."""
    if not documents:
        raise ValueError("No documents provided.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    chunks = splitter.split_documents(documents)

    chunks = [
        chunk for chunk in chunks
        if chunk.page_content and chunk.page_content.strip()
    ]

    if not chunks:
        raise ValueError("No readable chunks were created.")

    return chunks


def split_text_to_chunks(
    text: str,
    metadata: Optional[Dict[str, Any]] = None,
    chunk_size: int = 800,
    chunk_overlap: int = 100,
) -> List[Document]:
    """Split raw text into LangChain Document chunks with associated metadata."""
    if not text or not text.strip():
        raise ValueError("Text content cannot be empty.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    docs = splitter.create_documents(
        texts=[text.strip()],
        metadatas=[metadata or {}],
    )

    chunks = [d for d in docs if d.page_content and d.page_content.strip()]
    if not chunks:
        raise ValueError("No readable chunks were created from text.")

    return chunks
