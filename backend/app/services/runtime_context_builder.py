"""runtime_context_builder.py
------------------------------
Deterministic Runtime Context Builder and Composer for Parent and Child Assistants in PromptForge.

Single source of truth for constructing full LLM prompts and context payloads:
  - Parent configuration (instructions, persona, task, context, response format, variables)
  - Child configuration (instructions, variables, output contract, description)
  - Input Context boundaries (parent_variables, parent_instructions, previous_module_output, user_input)
  - Runtime variable resolution (runtime inputs -> latest run history -> definitions/defaults)
  - Previous Child / Module output retrieval via Conversation/Message APIs
  - Relevant Conversation history
  - Scoped RAG document context
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..models.module_reference import ModuleReference
from ..models.conversation import Conversation, Message
from ..models.prompt_run_history import PromptRunHistory
from ..services.conversation_service import conversation_service
from ..services.composer_service import (
    format_output_format_section,
    format_examples_section,
)
from ..services.run_service import extract_variable_specs_from_definition

logger = logging.getLogger(__name__)

STANDARD_CONTEXT_KEYS = {
    "parent_variables",
    "parent_instructions",
    "previous_module_output",
    "user_input",
}


@dataclass
class RuntimeContextResult:
    """Structured representation of the deterministic runtime context for LLM generation."""
    scope_type: str  # "parent" or "child"
    prompt_system_id: int
    module_id: Optional[int]
    parent_context: Optional[Dict[str, Any]] = None
    child_context: Optional[Dict[str, Any]] = None
    resolved_variables: Dict[str, Any] = field(default_factory=dict)
    previous_child_context: List[Dict[str, Any]] = field(default_factory=list)
    conversation_history: List[Dict[str, str]] = field(default_factory=list)
    rag_context: Optional[str] = None
    user_input: str = ""
    system_prompt: str = ""
    messages: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scope_type": self.scope_type,
            "prompt_system_id": self.prompt_system_id,
            "module_id": self.module_id,
            "parent_context": self.parent_context,
            "child_context": self.child_context,
            "variables": self.resolved_variables,
            "previous_child_context": self.previous_child_context,
            "conversation_history": self.conversation_history,
            "rag_context": self.rag_context,
            "user_input": self.user_input,
            "system_prompt": self.system_prompt,
        }


def extract_selected_contexts(input_context: Any, input_mapping: Any = None) -> Set[str]:
    """
    Extract normalized context boundary keys from a module's input_context and input_mapping.
    Supported keys: parent_variables, parent_instructions, previous_module_output, user_input.
    """
    selected: Set[str] = set()

    if isinstance(input_context, list):
        for item in input_context:
            if isinstance(item, str) and item.strip():
                clean = item.strip().lower()
                if clean in STANDARD_CONTEXT_KEYS:
                    selected.add(clean)
            elif isinstance(item, dict):
                k = item.get("key") or item.get("name") or str(item)
                clean = str(k).strip().lower()
                if clean in STANDARD_CONTEXT_KEYS:
                    selected.add(clean)
    elif isinstance(input_context, dict):
        for k in input_context.keys():
            clean = str(k).strip().lower()
            if clean in STANDARD_CONTEXT_KEYS:
                selected.add(clean)
    elif isinstance(input_context, str) and input_context.strip():
        clean = input_context.strip().lower()
        if clean in STANDARD_CONTEXT_KEYS:
            selected.add(clean)

    if isinstance(input_mapping, dict):
        for k, v in input_mapping.items():
            k_clean = str(k).strip().lower()
            if k_clean in STANDARD_CONTEXT_KEYS:
                selected.add(k_clean)
            if isinstance(v, str):
                v_clean = v.strip("{}").strip().lower()
                if v_clean in STANDARD_CONTEXT_KEYS:
                    selected.add(v_clean)

    return selected


async def resolve_runtime_variables(
    db: Optional[AsyncSession],
    user_id: int,
    configured_variables: Any,
    supplied_variables: Optional[Dict[str, Any]] = None,
    prompt_system_id: Optional[int] = None,
    module_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Resolve variables to actual values with priority:
      1. Explicit supplied runtime variables (from active request or UI).
      2. Latest saved PromptRunHistory snapshot for this user and system.
      3. Default value in variable definition.
    """
    specs = extract_variable_specs_from_definition(configured_variables)
    resolved: Dict[str, Any] = {}
    supplied = supplied_variables or {}

    # Check for historical runtime values if db is available
    history_vars: Dict[str, Any] = {}
    if db and prompt_system_id:
        try:
            stmt = (
                select(PromptRunHistory.runtime_variables)
                .where(
                    PromptRunHistory.user_id == user_id,
                    PromptRunHistory.prompt_system_id == prompt_system_id,
                )
            )
            if module_id is not None:
                stmt = stmt.where(PromptRunHistory.module_id == module_id)
            stmt = stmt.order_by(PromptRunHistory.created_at.desc()).limit(1)
            row = (await db.execute(stmt)).scalar_one_or_none()
            if isinstance(row, dict):
                history_vars = row
        except Exception as e:
            logger.debug(f"Could not load run history variables: {e}")

    for name, spec in specs.items():
        val = None
        # 1. Supplied in chat request
        if name in supplied and supplied[name] is not None and str(supplied[name]).strip() != "":
            val = supplied[name]
        # 2. From recent history run
        elif name in history_vars and history_vars[name] is not None and str(history_vars[name]).strip() != "":
            val = history_vars[name]
        # 3. Default from definition
        elif spec.get("default") is not None and str(spec.get("default")).strip() != "":
            val = spec.get("default")
        else:
            val = spec.get("default") or ""

        resolved[name] = val

    # Include any additional supplied variables even if not explicitly in specs
    for k, v in supplied.items():
        if k not in resolved and v is not None and str(v).strip() != "":
            resolved[k] = v

    return resolved


def format_variables_block(variables: Dict[str, Any]) -> Optional[str]:
    """Format key-value variable assignments for system prompt inclusion."""
    if not variables:
        return None
    lines: List[str] = []
    for k, v in variables.items():
        str_val = str(v).strip() if v is not None else ""
        if str_val:
            lines.append(f"{k} = {str_val}")
        else:
            lines.append(f"{k} = (not provided)")
    return "\n".join(lines) if lines else None


async def get_recent_child_outputs(
    db: AsyncSession,
    user_id: int,
    prompt_system_id: int,
    current_conversation_id: Optional[int] = None,
    current_module_id: Optional[int] = None,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    """
    Retrieve previous child/module interactions/outputs in this Prompt System.
    Queries existing Conversations & Messages for child modules.
    """
    results: List[Dict[str, Any]] = []
    try:
        # Find recent conversations in this prompt system
        stmt = (
            select(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.prompt_system_id == prompt_system_id,
            )
        )
        if current_conversation_id is not None:
            stmt = stmt.where(Conversation.id != current_conversation_id)

        stmt = stmt.order_by(Conversation.updated_at.desc()).limit(limit)
        convs = (await db.execute(stmt)).scalars().all()

        for conv in convs:
            # Get latest assistant messages from each previous conversation
            msg_stmt = (
                select(Message)
                .where(
                    Message.conversation_id == conv.id,
                    Message.role == "assistant",
                )
                .order_by(Message.created_at.desc())
                .limit(2)
            )
            assistant_msgs = (await db.execute(msg_stmt)).scalars().all()
            if assistant_msgs:
                latest = assistant_msgs[0]
                results.append({
                    "conversation_id": conv.id,
                    "module_id": conv.module_id,
                    "title": conv.title or f"Conversation #{conv.id}",
                    "output": latest.content.strip(),
                })
    except Exception as e:
        logger.warning(f"Failed to retrieve previous child context: {e}")

    return results


async def build_runtime_context(
    db: AsyncSession,
    user_id: int,
    prompt_system_id: int,
    question: str,
    module_id: Optional[int] = None,
    conversation_id: Optional[int] = None,
    runtime_variables: Optional[Dict[str, Any]] = None,
    retrieved_documents: Optional[List[Any]] = None,
) -> RuntimeContextResult:
    """
    Deterministic runtime context builder for both Parent and Child Assistants.

    Returns a RuntimeContextResult containing:
      - parent_context (metadata & resolved variables)
      - child_context (metadata & resolved variables, if child chat)
      - resolved_variables (all effective variables)
      - previous_child_context (prior module outputs, if enabled)
      - conversation_history (loaded from DB messages)
      - rag_context (formatted grounding docs)
      - user_input
      - system_prompt (ready for LLM system message)
      - messages (full messages array ready for chat API)
    """
    clean_question = question.strip() if question else ""
    scope_type = "child" if module_id is not None else "parent"

    # 1. Fetch Parent Prompt System
    sys_stmt = select(PromptSystem).where(
        PromptSystem.id == prompt_system_id,
        PromptSystem.owner_id == user_id,
    )
    system: Optional[PromptSystem] = (await db.execute(sys_stmt)).scalar_one_or_none()

    # 2. Fetch Child Module & ModuleReference if module_id is provided
    module: Optional[PromptModule] = None
    mod_ref: Optional[ModuleReference] = None
    if module_id is not None:
        mod_stmt = select(PromptModule).where(
            PromptModule.id == module_id,
            PromptModule.owner_id == user_id,
        )
        module = (await db.execute(mod_stmt)).scalar_one_or_none()

        ref_stmt = (
            select(ModuleReference)
            .where(
                ModuleReference.prompt_system_id == prompt_system_id,
                ModuleReference.module_id == module_id,
            )
            .limit(1)
        )
        mod_ref = (await db.execute(ref_stmt)).scalar_one_or_none()

    # 3. Resolve Input Context Boundaries for Child
    selected_contexts: Set[str] = set()
    if module is not None:
        selected_contexts = extract_selected_contexts(
            module.input_context,
            mod_ref.input_mapping if mod_ref else None,
        )

    # 4. Resolve Variables
    parent_resolved_vars: Dict[str, Any] = {}
    child_resolved_vars: Dict[str, Any] = {}

    if system:
        parent_resolved_vars = await resolve_runtime_variables(
            db=db,
            user_id=user_id,
            configured_variables=system.variables,
            supplied_variables=runtime_variables if scope_type == "parent" else None,
            prompt_system_id=prompt_system_id,
            module_id=None,
        )

    if module:
        child_resolved_vars = await resolve_runtime_variables(
            db=db,
            user_id=user_id,
            configured_variables=module.variables,
            supplied_variables=runtime_variables if scope_type == "child" else None,
            prompt_system_id=prompt_system_id,
            module_id=module_id,
        )

    # 5. Retrieve Previous Child Context if enabled
    previous_child_context: List[Dict[str, Any]] = []
    if scope_type == "child" and "previous_module_output" in selected_contexts:
        previous_child_context = await get_recent_child_outputs(
            db=db,
            user_id=user_id,
            prompt_system_id=prompt_system_id,
            current_conversation_id=conversation_id,
            current_module_id=module_id,
        )

    # 6. Format RAG Grounding Documents
    rag_context_text = None
    if retrieved_documents and len(retrieved_documents) > 0:
        doc_blocks = []
        for doc in retrieved_documents:
            filename = doc.metadata.get("filename", "Document") if hasattr(doc, "metadata") else "Document"
            page = doc.metadata.get("page", "?") if hasattr(doc, "metadata") else "?"
            content = doc.page_content.strip() if hasattr(doc, "page_content") else str(doc).strip()
            doc_blocks.append(f"--- Document: {filename} (Page {page}) ---\n{content}")

        rag_context_text = (
            "[Uploaded Documents Context]\n"
            + "\n\n".join(doc_blocks)
            + "\n\nInstructions for document grounding:\n"
            "- When answering questions regarding the uploaded documents, use the information provided above.\n"
            "- If the answer is found in the documents, ground your answer on the document context and cite the source.\n"
            "- If the user asks a general question not covered by the documents, answer helpfully and accurately using your general knowledge."
        )

    # 7. Build System Prompt & Context Payloads
    system_prompt_parts: List[str] = []
    parent_context_dict: Optional[Dict[str, Any]] = None
    child_context_dict: Optional[Dict[str, Any]] = None

    if scope_type == "parent":
        # ------------------ PARENT ASSISTANT CONTEXT ------------------
        sys_name = system.name if system else f"System #{prompt_system_id}"
        system_prompt_parts.append(
            f"You are an intelligent AI Assistant acting as the Parent Assistant for Prompt System: \"{sys_name}\"."
        )

        if system:
            # Description
            if system.description and system.description.strip():
                system_prompt_parts.append(f"[System Description]\n{system.description.strip()}")

            # System Instructions (Persona, Task, Core Instructions, Context)
            if system.instructions and system.instructions.strip():
                system_prompt_parts.append(f"[System Instructions / Persona & Task]\n{system.instructions.strip()}")

            # Configured Variables
            vars_formatted = format_variables_block(parent_resolved_vars)
            if vars_formatted:
                system_prompt_parts.append(f"[Variables & Current Values]\n{vars_formatted}")

            # Response Format / Output Requirements
            out_req = format_output_format_section(system.output_format)
            if out_req:
                system_prompt_parts.append(f"[Response Format / Output Requirements]\n{out_req}")

            # Examples
            ex_text = format_examples_section(system.examples)
            if ex_text:
                system_prompt_parts.append(f"[Examples]\n{ex_text}")

            parent_context_dict = {
                "id": system.id,
                "name": system.name,
                "description": system.description,
                "instructions": system.instructions,
                "variables": parent_resolved_vars,
                "output_format": system.output_format,
                "examples": system.examples,
            }

        if rag_context_text:
            system_prompt_parts.append(rag_context_text)

        effective_variables = parent_resolved_vars

    else:
        # ------------------ CHILD ASSISTANT CONTEXT ------------------
        mod_name = module.name if module else f"Module #{module_id}"
        sys_name = system.name if system else f"System #{prompt_system_id}"
        system_prompt_parts.append(
            f"You are an intelligent AI Assistant executing Child Module: \"{mod_name}\" within Prompt System: \"{sys_name}\"."
        )

        # 1. Selected Parent Context (Strictly bounded by input_context)
        parent_vars_to_include: Dict[str, Any] = {}
        if system:
            # Parent Instructions (Only when parent_instructions is ON)
            if "parent_instructions" in selected_contexts:
                if system.instructions and system.instructions.strip():
                    system_prompt_parts.append(f"[Parent System Instructions / Persona & Task]\n{system.instructions.strip()}")
                out_req = format_output_format_section(system.output_format)
                if out_req:
                    system_prompt_parts.append(f"[Parent Response Format]\n{out_req}")

            # Parent Variables (Only when parent_variables is ON)
            if "parent_variables" in selected_contexts:
                parent_vars_to_include = parent_resolved_vars
                p_vars_formatted = format_variables_block(parent_resolved_vars)
                if p_vars_formatted:
                    system_prompt_parts.append(f"[Parent Variables]\n{p_vars_formatted}")

            parent_context_dict = {
                "id": system.id,
                "name": system.name,
                "instructions": system.instructions if "parent_instructions" in selected_contexts else None,
                "variables": parent_vars_to_include,
                "output_format": system.output_format if "parent_instructions" in selected_contexts else None,
            }

        # 2. Child Module Context (Always included)
        if module:
            if module.description and module.description.strip():
                system_prompt_parts.append(f"[Child Assistant Description]\n{module.description.strip()}")

            if module.instructions and module.instructions.strip():
                system_prompt_parts.append(f"[Child Module Instructions]\n{module.instructions.strip()}")

            c_vars_formatted = format_variables_block(child_resolved_vars)
            if c_vars_formatted:
                system_prompt_parts.append(f"[Child Variables]\n{c_vars_formatted}")

            out_contract = format_output_format_section(module.output_contract)
            if out_contract:
                system_prompt_parts.append(f"[Child Output Contract / Response Requirements]\n{out_contract}")

            ex_text = format_examples_section(module.examples)
            if ex_text:
                system_prompt_parts.append(f"[Child Examples]\n{ex_text}")

            child_context_dict = {
                "id": module.id,
                "name": module.name,
                "description": module.description,
                "instructions": module.instructions,
                "variables": child_resolved_vars,
                "output_contract": module.output_contract,
                "examples": module.examples,
                "input_context": list(selected_contexts),
            }

        # 3. Previous Child Outputs (Only when previous_module_output is ON)
        if previous_child_context:
            prev_lines = []
            for item in previous_child_context:
                t = item.get("title", "Previous Interaction")
                out = item.get("output", "")
                if out:
                    prev_lines.append(f"- From {t}:\n  {out}")
            if prev_lines:
                system_prompt_parts.append("[Previous Module / Child Output]\n" + "\n\n".join(prev_lines))

        # 4. Scoped Child Documents
        if rag_context_text:
            system_prompt_parts.append(rag_context_text)

        effective_variables = {**parent_vars_to_include, **child_resolved_vars}

    final_system_prompt = "\n\n".join(system_prompt_parts)

    # 8. Load Conversation History from DB
    history_messages: List[Dict[str, str]] = []
    if conversation_id:
        try:
            all_msgs = await conversation_service.get_messages(db, user_id, conversation_id)
            # If the user's message was just stored, omit the very last one so it isn't duplicated
            if all_msgs and all_msgs[-1].role == "user" and all_msgs[-1].content.strip() == clean_question:
                msgs_to_include = all_msgs[:-1]
            else:
                msgs_to_include = all_msgs

            for m in msgs_to_include:
                if m.role in ("user", "assistant") and m.content and m.content.strip():
                    history_messages.append({"role": m.role, "content": m.content.strip()})
        except Exception as e:
            logger.warning(f"Could not load conversation history: {e}")

    # 9. Assemble Full Chat Messages List
    messages: List[Dict[str, str]] = [{"role": "system", "content": final_system_prompt}]
    messages.extend(history_messages)
    if clean_question:
        messages.append({"role": "user", "content": clean_question})

    return RuntimeContextResult(
        scope_type=scope_type,
        prompt_system_id=prompt_system_id,
        module_id=module_id,
        parent_context=parent_context_dict,
        child_context=child_context_dict,
        resolved_variables=effective_variables,
        previous_child_context=previous_child_context,
        conversation_history=history_messages,
        rag_context=rag_context_text,
        user_input=clean_question,
        system_prompt=final_system_prompt,
        messages=messages,
    )
