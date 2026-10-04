"""conversation.py
---------------
Conversation history formatting and contextual question rewriting for PromptForge RAG.
"""

import logging
from typing import List, Dict, Any, Union

logger = logging.getLogger(__name__)


def format_conversation_history(history: List[Union[Dict[str, Any], Any]]) -> str:
    """Format conversation messages into a clean chronological text representation."""
    if not history:
        return ""

    lines = []
    for msg in history:
        if isinstance(msg, dict):
            role = msg.get("role", "user")
            content = msg.get("content", "")
        else:
            role = getattr(msg, "role", "user")
            content = getattr(msg, "content", "")

        if content and content.strip():
            lines.append(f"{role.capitalize()}: {content.strip()}")

    return "\n".join(lines)


def rewrite_question(llm_client, question: str, history: List[Union[Dict[str, Any], Any]]) -> str:
    """
    Rewrite a follow-up question into a standalone question to resolve references
    like 'it', 'they', 'its' using conversation history.
    """
    if not question or not question.strip():
        raise ValueError("Question cannot be empty.")

    if not history:
        return question.strip()

    history_text = format_conversation_history(history)
    if not history_text:
        return question.strip()

    prompt = f"""Rewrite the user's latest question into a clear, standalone question.
Use the conversation history ONLY to resolve pronouns or ambiguous references (such as 'it', 'its', 'they', 'that').
If the question is already clear and standalone, return it unchanged.
Do not answer the question, only rewrite it.

Conversation:
{history_text}

Latest question:
{question.strip()}

Standalone question:"""

    try:
        if hasattr(llm_client, "invoke"):
            res = llm_client.invoke(prompt)
            rewritten = res.content.strip() if hasattr(res, "content") else str(res).strip()
        elif hasattr(llm_client, "chat") and hasattr(llm_client.chat, "completions"):
            # Groq client
            import os
            model = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
            completion = llm_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=model,
                temperature=0.0,
            )
            rewritten = completion.choices[0].message.content.strip()
        else:
            rewritten = question.strip()

        # Sanity check: do not let rewrite become absurdly long or empty
        if rewritten and len(rewritten) < len(question) * 4:
            logger.info(f"Rewrote question '{question}' -> '{rewritten}'")
            return rewritten
        return question.strip()

    except Exception as error:
        logger.warning(f"Question rewrite failed ({error}). Using original question.")
        return question.strip()
