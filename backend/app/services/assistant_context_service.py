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
        
        parent_context = {}
        parent_instructions = None
        
        if ref and ref.prompt_system:
            system = ref.prompt_system
            if system.owner_id == user_id:
                # Build parent context based on its variables and examples if any
                parent_context = {
                    "variables": system.variables,
                    "examples": system.examples,
                    "output_format": system.output_format
                }
                parent_instructions = system.instructions

        # Get previous child context (other conversations of this assistant)
        prev_context = []
        if conversation_id:
            conv_stmt = select(Conversation).where(
                Conversation.module_id == assistant_id,
                Conversation.user_id == user_id,
                Conversation.id != conversation_id
            ).order_by(Conversation.updated_at.desc()).limit(3)
            recent_convs = (await db.execute(conv_stmt)).scalars().all()
            for conv in recent_convs:
                # fetch latest messages
                msg_stmt = select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.desc()).limit(5)
                msgs = (await db.execute(msg_stmt)).scalars().all()
                msgs.reverse()
                prev_context.append({
                    "conversation_id": conv.id,
                    "title": conv.title,
                    "messages": [{"role": m.role, "content": m.content} for m in msgs]
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

        return AssistantContextResponse(
            parent_context=parent_context,
            parent_instructions=parent_instructions,
            current_child_context={"variables": module.variables, "input_context": module.input_context, "output_contract": module.output_contract},
            current_child_instructions=module.instructions,
            previous_child_context=prev_context,
            current_conversation_history=current_history,
        )

assistant_context_service = AssistantContextService()
