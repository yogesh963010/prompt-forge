"""pipeline.py
-----------
End-to-end RAG pipeline for PromptForge.

Flow:
  User Question
        ↓
  Rewrite Follow-up with Conversation History (if applicable)
        ↓
  Retrieve Scoped Documents (BM25 + FAISS + Reranking)
        ↓
  Context Construction (System Instructions + Child Instructions + Docs + History)
        ↓
  LLM Generation (Groq / cached model)
        ↓
  Answer + Sources
"""

import logging
from typing import Optional, Dict, Any, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .generator import get_llm, generate_answer
from .conversation import rewrite_question
from .retriever import retrieve_scoped_documents, get_sources_from_documents
from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..models.conversation import Conversation, Message
from ..services.conversation_service import conversation_service
from ..services.runtime_context_builder import build_runtime_context

logger = logging.getLogger(__name__)


async def run_promptforge_rag(
    user_id: int,
    prompt_system_id: int,
    question: str,
    module_id: Optional[int] = None,
    conversation_id: Optional[int] = None,
    runtime_variables: Optional[Dict[str, Any]] = None,
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """
    Run conversational RAG pipeline inside PromptForge with deterministic runtime context building.

    Parameters
    ----------
    user_id : int
        Authenticated user ID.
    prompt_system_id : int
        Current Prompt System ID.
    question : str
        User's question.
    module_id : Optional[int]
        Child Assistant Module ID (None for Parent Assistant).
    conversation_id : Optional[int]
        Current PromptForge Conversation ID.
    runtime_variables : Optional[Dict[str, Any]]
        Current runtime variable values provided by user.
    db : Optional[AsyncSession]
        Database session for fetching instructions, variables, and history.

    Returns
    -------
    dict
        {"answer": str, "sources": list, "context": dict}
    """
    if not question or not question.strip():
        raise ValueError("Question cannot be empty.")

    clean_question = question.strip()
    llm = get_llm()

    # 1. Fetch conversation history from PromptForge DB
    history_messages: List[Message] = []
    if db and conversation_id:
        try:
            all_msgs = await conversation_service.get_messages(db, user_id, conversation_id)
            # Exclude current question if it was just saved before calling /ask
            if all_msgs and all_msgs[-1].role == "user" and all_msgs[-1].content.strip() == clean_question:
                history_messages = all_msgs[:-1]
            else:
                history_messages = all_msgs
        except Exception as e:
            logger.warning(f"Could not load conversation history for conv {conversation_id}: {e}")

    logger.info(
        f"[CHAT] conversation_id={conversation_id} history_count={len(history_messages)}"
    )

    # 2. Rewrite follow-up question if history exists
    standalone_question = clean_question
    if history_messages:
        try:
            standalone_question = rewrite_question(llm, clean_question, history_messages)
        except Exception as e:
            logger.warning(f"Follow-up rewriting failed: {e}")
            standalone_question = clean_question

    # 3. Retrieve isolated scoped documents
    retrieved_docs = retrieve_scoped_documents(
        user_id=user_id,
        prompt_system_id=prompt_system_id,
        module_id=module_id,
        question=standalone_question,
    )

    # 4. Deterministic Runtime Context Construction
    runtime_ctx = None
    if db:
        try:
            runtime_ctx = await build_runtime_context(
                db=db,
                user_id=user_id,
                prompt_system_id=prompt_system_id,
                question=clean_question,
                module_id=module_id,
                conversation_id=conversation_id,
                runtime_variables=runtime_variables,
                retrieved_documents=retrieved_docs,
            )
        except Exception as ctx_err:
            logger.error(f"Failed to build runtime context: {ctx_err}", exc_info=True)

    # 5. Generate Answer via LLM
    if runtime_ctx:
        answer = generate_answer(
            llm_client=llm,
            question=clean_question,
            custom_system_prompt=runtime_ctx.system_prompt,
            custom_messages=runtime_ctx.messages,
        )
    else:
        # Fallback if db is not provided
        answer = generate_answer(
            llm_client=llm,
            question=clean_question,
            documents=retrieved_docs if retrieved_docs else None,
            conversation_history=history_messages,
        )

    # 6. Extract Sources
    sources = get_sources_from_documents(retrieved_docs)

    return {
        "answer": answer,
        "sources": sources,
        "context": runtime_ctx.to_dict() if runtime_ctx else None,
    }
