import os
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any, Union
from dotenv import load_dotenv
from langchain_core.documents import Document

logger = logging.getLogger(__name__)

# Ensure environment variables are loaded from backend/.env
_backend_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv()

# Cached LLM client singleton
_llm_client = None


class GroqLLMWrapper:
    """Wrapper around native Groq client providing both .invoke() and .chat.completions interfaces."""

    def __init__(self, client, model: str):
        self.client = client
        self.model = model.replace("groq:", "")
        self.chat = client.chat

    def invoke(self, input_val):
        """Invoke LLM with prompt string, list of dicts, or LangChain messages."""
        if isinstance(input_val, str):
            messages = [{"role": "user", "content": input_val}]
        elif isinstance(input_val, list):
            messages = []
            for m in input_val:
                if isinstance(m, dict):
                    messages.append(m)
                elif hasattr(m, "content"):
                    role = "user"
                    m_type = getattr(m, "type", "")
                    if m_type in ("system", "system_message"):
                        role = "system"
                    elif m_type in ("ai", "assistant"):
                        role = "assistant"
                    messages.append({"role": role, "content": str(m.content)})
                else:
                    messages.append({"role": "user", "content": str(m)})
        else:
            messages = [{"role": "user", "content": str(input_val)}]

        completion = self.client.chat.completions.create(
            messages=messages,
            model=self.model,
            temperature=0.3,
        )
        content = completion.choices[0].message.content or ""

        class ResponseObj:
            def __init__(self, c):
                self.content = c

            def __str__(self):
                return self.content

        return ResponseObj(content.strip())


def get_llm():
    """Return the shared Groq / LLM client, initialized on first call."""
    global _llm_client
    if _llm_client is not None:
        return _llm_client

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.warning("GROQ_API_KEY is not set. LLM calls may fail.")

    model_name = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
    clean_model = model_name.replace("groq:", "")

    try:
        from groq import Groq
        raw_client = Groq(api_key=api_key)
        _llm_client = GroqLLMWrapper(raw_client, clean_model)
        logger.info("Initialized native Groq LLM client wrapper.")
        return _llm_client
    except Exception as error:
        logger.warning(f"Native Groq initialization failed ({error}). Trying langchain chat model.")

    try:
        from langchain.chat_models import init_chat_model
        if not model_name.startswith("groq:"):
            model_name = f"groq:{model_name}"
        _llm_client = init_chat_model(model_name)
        logger.info(f"Initialized LangChain chat model: {model_name}")
        return _llm_client
    except Exception as error:
        raise RuntimeError(f"Could not initialize LLM client: {error}") from error


def build_system_prompt(
    system_instructions: Optional[str] = None,
    child_instructions: Optional[str] = None,
    variables: Optional[Dict[str, Any]] = None,
    documents: Optional[List[Document]] = None,
) -> str:
    """Build grounded system prompt incorporating instructions, variables, and retrieved PDF chunks."""
    parts = ["You are an intelligent AI Assistant in PromptForge."]

    if system_instructions and system_instructions.strip():
        parts.append(f"[System Instructions]\n{system_instructions.strip()}")

    if child_instructions and child_instructions.strip():
        parts.append(f"[Child Assistant Instructions]\n{child_instructions.strip()}")

    if variables and len(variables) > 0:
        var_text = "\n".join(f"{k}: {v}" for k, v in variables.items() if v is not None)
        if var_text.strip():
            parts.append(f"[Variables]\n{var_text.strip()}")

    if documents and len(documents) > 0:
        doc_context = "\n\n".join(
            f"--- Document: {doc.metadata.get('filename', 'document')} (Page {doc.metadata.get('page', '?')}) ---\n{doc.page_content.strip()}"
            for doc in documents
        )
        parts.append(
            f"[Uploaded Documents Context]\n{doc_context}\n\n"
            "Instructions for document grounding:\n"
            "1. When answering questions regarding the uploaded documents, use the information provided above.\n"
            "2. If the answer is found in the documents, ground your answer on the document context and cite the source.\n"
            "3. If the user asks a general question not covered by the documents, answer helpfully and accurately using your general knowledge."
        )

    return "\n\n".join(parts)


def generate_answer(
    llm_client,
    question: str,
    documents: Optional[List[Document]] = None,
    conversation_history: Optional[List[Union[Dict[str, Any], Any]]] = None,
    system_instructions: Optional[str] = None,
    child_instructions: Optional[str] = None,
    variables: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Generate an answer using LLM with conversation history and optional document context.
    """
    if not question or not question.strip():
        raise ValueError("Question cannot be empty.")

    system_content = build_system_prompt(
        system_instructions=system_instructions,
        child_instructions=child_instructions,
        variables=variables,
        documents=documents,
    )

    messages = [{"role": "system", "content": system_content}]

    # Append recent conversation history
    if conversation_history:
        for msg in conversation_history:
            if isinstance(msg, dict):
                role = msg.get("role", "user")
                content = msg.get("content", "")
            else:
                role = getattr(msg, "role", "user")
                content = getattr(msg, "content", "")

            if role in ("user", "assistant") and content and content.strip():
                messages.append({"role": role, "content": content.strip()})

    # Append current user question
    messages.append({"role": "user", "content": question.strip()})

    model_name = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
    # Clean model prefix if present
    clean_model = model_name.replace("groq:", "")

    # Execute via native client or langchain client
    if hasattr(llm_client, "chat") and hasattr(llm_client.chat, "completions"):
        completion = llm_client.chat.completions.create(
            messages=messages,
            model=clean_model,
            temperature=0.3,
        )
        return completion.choices[0].message.content.strip()

    elif hasattr(llm_client, "invoke"):
        # LangChain Chat Model
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
        lc_messages = []
        for m in messages:
            if m["role"] == "system":
                lc_messages.append(SystemMessage(content=m["content"]))
            elif m["role"] == "assistant":
                lc_messages.append(AIMessage(content=m["content"]))
            else:
                lc_messages.append(HumanMessage(content=m["content"]))

        response = llm_client.invoke(lc_messages)
        return response.content.strip() if hasattr(response, "content") else str(response).strip()

    raise RuntimeError("Unsupported LLM client interface.")
