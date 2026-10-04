"""rag.py
------
FastAPI route definitions for PromptForge RAG (/ask and related endpoints).
"""

import re
import logging
from typing import Optional, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user, security
from ..models.user import User
from ..models.conversation import Conversation
from ..services.conversation_service import conversation_service
from ..rag.pipeline import run_promptforge_rag
from ..rag.vectorstore import load_vectorstore

logger = logging.getLogger(__name__)

router = APIRouter(tags=["RAG"])


class SourceItem(BaseModel):
    """Document source reference with optional page number."""
    source: Optional[str] = None
    page: Optional[int] = None


class AskRequest(BaseModel):
    """Request model for /ask (conversational RAG) endpoint."""
    question: str = Field(..., description="The user's question.")
    conversation_id: Optional[int] = Field(None, description="Optional PromptForge Conversation ID.")
    prompt_system_id: Optional[int] = Field(None, description="Optional Prompt System ID.")
    module_id: Optional[int] = Field(None, description="Optional Child Assistant Module ID.")
    session_id: Optional[str] = Field(None, description="Optional legacy session identifier for context resolution.")


class ChatResponse(BaseModel):
    """Response model for /ask and /chat endpoints."""
    answer: str
    sources: List[SourceItem] = Field(default_factory=list)


class StatusResponse(BaseModel):
    """Response model for /status endpoint."""
    has_document: bool
    filename: Optional[str] = None


async def get_user_for_rag(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
) -> User:
    """Resolve authenticated user for RAG queries."""
    if current_user:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required for RAG assistant.",
    )


@router.post(
    "/ask",
    response_model=ChatResponse,
    summary="Ask a question using PromptForge local RAG pipeline",
    description="Conversational RAG endpoint using local FAISS retrieval, conversation history, and LLM.",
)
async def ask(
    request: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_for_rag),
):
    """
    Execute conversational RAG query:
      1. Resolves conversation, prompt_system_id, and module_id from request or session_id fallback.
      2. Uses authenticated user id (never trusts client user_id).
      3. Loads conversation history from PromptForge DB.
      4. Rewrites question to resolve follow-ups.
      5. Retrieves isolated PDF chunks strictly scoped to the user, system, and module.
      6. Generates LLM response with grounded context or answers directly if no docs exist.
      7. Returns answer and sources.
    """
    if not request.question or not request.question.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty.",
        )

    user_id = current_user.id
    conversation_id = request.conversation_id
    prompt_system_id = request.prompt_system_id
    module_id = request.module_id

    # Fallback: parse session_id string if provided by older frontend code
    # e.g., "pf_u1_s10_m2_c5" or "pf_u1_s10_p_c5"
    if request.session_id:
        if conversation_id is None:
            c_match = re.search(r"_c(\d+)", request.session_id)
            if c_match:
                try:
                    conversation_id = int(c_match.group(1))
                except ValueError:
                    pass

        if prompt_system_id is None:
            s_match = re.search(r"_s(\d+)", request.session_id)
            if s_match:
                try:
                    prompt_system_id = int(s_match.group(1))
                except ValueError:
                    pass

        if module_id is None:
            m_match = re.search(r"_m(\d+)", request.session_id)
            if m_match:
                try:
                    module_id = int(m_match.group(1))
                except ValueError:
                    pass

    # If conversation_id is available, verify ownership and infer prompt_system_id / module_id
    if conversation_id:
        conv = await conversation_service.get_conversation(db, user_id, conversation_id)
        if conv:
            if prompt_system_id is None:
                prompt_system_id = conv.prompt_system_id
            if module_id is None:
                module_id = conv.module_id

    # If still no prompt_system_id, default to 0 (general chatbot query)
    if prompt_system_id is None:
        prompt_system_id = 0

    try:
        result = await run_promptforge_rag(
            user_id=user_id,
            prompt_system_id=prompt_system_id,
            question=request.question.strip(),
            module_id=module_id,
            conversation_id=conversation_id,
            db=db,
        )

        return ChatResponse(
            answer=result["answer"],
            sources=[SourceItem(**s) for s in result.get("sources", [])],
        )

    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        logger.error(f"RAG execution failed: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while generating response: {str(err)}",
        )


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask a question (alias for /ask)",
    description="Tool-free RAG query alias for /ask.",
)
async def chat_alias(
    request: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_for_rag),
):
    """Alias for /ask to maintain backwards compatibility with any client calling /chat."""
    return await ask(request=request, db=db, current_user=current_user)


@router.get(
    "/status",
    response_model=StatusResponse,
    summary="Check document status for current scope",
)
async def get_rag_status(
    prompt_system_id: Optional[int] = None,
    module_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user_for_rag),
):
    """Check if a vector store exists for the current user and scope."""
    sys_id = prompt_system_id or 0
    store = load_vectorstore(current_user.id, sys_id, module_id)
    has_doc = store is not None
    return StatusResponse(has_document=has_doc, filename=None)
