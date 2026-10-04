import json
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..models.module_reference import ModuleReference
from ..models.conversation import Conversation, Message
from ..schemas.conversation import AssistantContextResponse, MessageRead

class AssistantContextService:
    async def get_assistant_context(
        self, db: AsyncSession, user_id: int, assistant_id: int, conversation_id: Optional[int] = None
    ) -> AssistantContextResponse:
        """
        Gets context for a Child Assistant (PromptModule) combined with its Parent (PromptSystem).
        assistant_id maps to a PromptModule ID.
        We need to find the Parent PromptSystem using ModuleReference.
        """
        # Find the module (Child Assistant)
        stmt = select(PromptModule).where(PromptModule.id == assistant_id, PromptModule.owner_id == user_id)
        module = (await db.execute(stmt)).scalar_one_or_none()
        if not module:
            raise ValueError("Child Assistant (PromptModule) not found or not owned by user.")
            
        # Find parent system(s) through ModuleReference
        # A module might belong to multiple systems, but usually we just need one parent.
        # Assuming we take the first enabled reference for context.
        ref_stmt = select(ModuleReference).where(
            ModuleReference.module_id == assistant_id,
            ModuleReference.enabled == True
        ).options(selectinload(ModuleReference.prompt_system))
        ref = (await db.execute(ref_stmt)).scalars().first()
        
        # Extract input context boundaries
        from .runtime_context_builder import extract_selected_contexts, resolve_runtime_variables
        selected_contexts = extract_selected_contexts(
            module.input_context,
            ref.input_mapping if ref else None,
        )

        parent_context = {}
        parent_instructions = None
        
        if ref and ref.prompt_system:
            system = ref.prompt_system
            if system.owner_id == user_id:
                # Resolve parent variables if parent_variables is enabled
                if "parent_variables" in selected_contexts:
                    resolved_p_vars = await resolve_runtime_variables(
                        db=db,
                        user_id=user_id,
                        configured_variables=system.variables,
                        prompt_system_id=system.id,
                        module_id=None,
                    )
                    parent_context["variables"] = resolved_p_vars

                # Include parent instructions and output_format if parent_instructions is enabled
                if "parent_instructions" in selected_contexts:
                    parent_instructions = system.instructions
                    parent_context["examples"] = system.examples
                    parent_context["output_format"] = system.output_format

        # Get previous child context only if previous_module_output is enabled
        prev_context = []
        if "previous_module_output" in selected_contexts:
            # Query recent conversations for this prompt system / child modules
            prompt_sys_id = ref.prompt_system_id if ref else None
            conv_stmt = select(Conversation).where(
                Conversation.user_id == user_id,
            )
            if prompt_sys_id:
                conv_stmt = conv_stmt.where(Conversation.prompt_system_id == prompt_sys_id)
            if conversation_id:
                conv_stmt = conv_stmt.where(Conversation.id != conversation_id)

            conv_stmt = conv_stmt.order_by(Conversation.updated_at.desc()).limit(3)
            recent_convs = (await db.execute(conv_stmt)).scalars().all()
            for conv in recent_convs:
                msg_stmt = (
                    select(Message)
                    .where(Message.conversation_id == conv.id, Message.role == "assistant")
                    .order_by(Message.created_at.desc())
                    .limit(2)
                )
                msgs = (await db.execute(msg_stmt)).scalars().all()
                msgs.reverse()
                if msgs:
                    prev_context.append({
                        "conversation_id": conv.id,
                        "title": conv.title or f"Conversation #{conv.id}",
                        "messages": [{"role": m.role, "content": m.content} for m in msgs],
                    })

        # Get current conversation history
        current_history = []
        if conversation_id:
            msg_stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
            msgs = (await db.execute(msg_stmt)).scalars().all()
            for m in msgs:
                current_history.append(
                    MessageRead.model_validate(m)
                )

        # Resolve child variables
        resolved_c_vars = await resolve_runtime_variables(
            db=db,
            user_id=user_id,
            configured_variables=module.variables,
            prompt_system_id=ref.prompt_system_id if ref else None,
            module_id=assistant_id,
        )

        return AssistantContextResponse(
            parent_context=parent_context,
            parent_instructions=parent_instructions,
            current_child_context={
                "variables": resolved_c_vars,
                "input_context": list(selected_contexts),
                "output_contract": module.output_contract,
            },
            current_child_instructions=module.instructions,
            previous_child_context=prev_context,
            current_conversation_history=current_history,
        )

assistant_context_service = AssistantContextService()
