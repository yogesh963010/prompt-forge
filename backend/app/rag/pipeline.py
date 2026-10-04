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

logger = logging.getLogger(__name__)


async def run_promptforge_rag(
    user_id: int,
    prompt_system_id: int,
    question: str,
    module_id: Optional[int] = None,
    conversation_id: Optional[int] = None,
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """
    Run conversational RAG pipeline inside PromptForge.

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
    db : Optional[AsyncSession]
        Database session for fetching instructions and history.

    Returns
    -------
    dict
        {"answer": str, "sources": list}
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

    # 4. Fetch Prompt System & Child Module instructions and variables
    system_instructions = None
    child_instructions = None
    merged_variables: Dict[str, Any] = {}

    if db:
        try:
            # Prompt System
            sys_stmt = select(PromptSystem).where(
                PromptSystem.id == prompt_system_id,
                PromptSystem.owner_id == user_id,
            )
            system = (await db.execute(sys_stmt)).scalar_one_or_none()
            if system:
                system_instructions = system.instructions
                if isinstance(system.variables, dict):
                    merged_variables.update(system.variables)
                elif isinstance(system.variables, list):
                    for var in system.variables:
                        if isinstance(var, dict) and "name" in var:
                            merged_variables[var["name"]] = var.get("default_value", "")

            # Child Module
            if module_id is not None:
                mod_stmt = select(PromptModule).where(
                    PromptModule.id == module_id,
                    PromptModule.owner_id == user_id,
                )
                module = (await db.execute(mod_stmt)).scalar_one_or_none()
                if module:
                    child_instructions = module.instructions
                    if isinstance(module.variables, dict):
                        merged_variables.update(module.variables)
                    elif isinstance(module.variables, list):
                        for var in module.variables:
                            if isinstance(var, dict) and "name" in var:
                                merged_variables[var["name"]] = var.get("default_value", "")
        except Exception as e:
            logger.warning(f"Failed to load system/module metadata: {e}")

    # 5. Generate Answer via LLM
    answer = generate_answer(
        llm_client=llm,
        question=clean_question,
        documents=retrieved_docs if retrieved_docs else None,
        conversation_history=history_messages,
        system_instructions=system_instructions,
        child_instructions=child_instructions,
        variables=merged_variables,
    )

    # 6. Extract Sources
    sources = get_sources_from_documents(retrieved_docs)

    return {
        "answer": answer,
        "sources": sources,
    }
