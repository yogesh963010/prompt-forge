import copy
import secrets
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.conversation import Conversation, Message
from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..models.module_reference import ModuleReference
from ..schemas.conversation import ConversationCreate, MessageCreate, ConversationUpdate

class ConversationService:
    async def create_conversation(
        self, db: AsyncSession, user_id: int, conv_in: ConversationCreate
    ) -> Conversation:
        # Validate parent/child ownership if provided
        if conv_in.prompt_system_id:
            stmt = select(PromptSystem).where(PromptSystem.id == conv_in.prompt_system_id, PromptSystem.owner_id == user_id)
            system = (await db.execute(stmt)).scalar_one_or_none()
            if not system:
                raise ValueError("PromptSystem not found or not owned by user.")
                
        if conv_in.module_id:
            stmt = select(PromptModule).where(PromptModule.id == conv_in.module_id, PromptModule.owner_id == user_id)
            module = (await db.execute(stmt)).scalar_one_or_none()
            if not module:
                raise ValueError("PromptModule not found or not owned by user.")

        db_conv = Conversation(
            user_id=user_id,
            prompt_system_id=conv_in.prompt_system_id,
            module_id=conv_in.module_id,
            title=conv_in.title,
            variables=conv_in.variables or {},
        )
        db.add(db_conv)
        await db.commit()
        await db.refresh(db_conv)
        return db_conv

    async def get_conversations(self, db: AsyncSession, user_id: int) -> List[Conversation]:
        stmt = select(Conversation).where(Conversation.user_id == user_id).order_by(desc(Conversation.created_at))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_conversation(self, db: AsyncSession, user_id: int, conversation_id: int) -> Optional[Conversation]:
        stmt = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_conversation(self, db: AsyncSession, user_id: int, conversation_id: int) -> bool:
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            return False
        await db.delete(conv)
        await db.commit()
        return True

    async def update_conversation(
        self, db: AsyncSession, user_id: int, conversation_id: int, conv_in: ConversationUpdate
    ) -> Optional[Conversation]:
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            return None
        
        if conv_in.title is not None:
            conv.title = conv_in.title

        await db.commit()
        await db.refresh(conv)
        return conv

    async def get_messages(self, db: AsyncSession, user_id: int, conversation_id: int) -> List[Message]:
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            raise ValueError("Conversation not found.")
            
        stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def create_message(
        self, db: AsyncSession, user_id: int, conversation_id: int, msg_in: MessageCreate
    ) -> Message:
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            raise ValueError("Conversation not found.")
            
        valid_roles = {"user", "assistant", "system", "client"}
        if msg_in.role not in valid_roles:
            raise ValueError(f"Invalid role. Must be one of {valid_roles}")
            
        if not msg_in.content.strip():
            raise ValueError("Message content cannot be empty.")

        db_msg = Message(
            conversation_id=conversation_id,
            role=msg_in.role,
            content=msg_in.content,
        )
        db.add(db_msg)
        await db.commit()
        await db.refresh(db_msg)
        return db_msg

    async def delete_message(self, db: AsyncSession, user_id: int, conversation_id: int, message_id: int) -> bool:
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            return False
            
        stmt = select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id)
        msg = (await db.execute(stmt)).scalar_one_or_none()
        if not msg:
            return False
            
        await db.delete(msg)
        await db.commit()
        return True

    async def clear_messages(self, db: AsyncSession, user_id: int, conversation_id: int) -> bool:
        query = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id
        )
        result = await db.execute(query)
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return False
            
        delete_query = delete(Message).where(Message.conversation_id == conversation_id)
        await db.execute(delete_query)
        await db.commit()
        return True

    async def get_sharing_status(
        self, db: AsyncSession, user_id: int, conversation_id: int
    ) -> dict:
        """Get sharing status for a conversation (owner only)."""
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        if conv.visibility == "public_link" and conv.share_token:
            return {
                "visibility": "public_link",
                "share_token": conv.share_token,
                "share_url": f"/shared/chat/{conv.share_token}",
            }
        return {
            "visibility": "private",
            "share_token": None,
            "share_url": None,
        }

    async def update_sharing_status(
        self, db: AsyncSession, user_id: int, conversation_id: int, visibility: str
    ) -> dict:
        """Update sharing status for a conversation (owner only)."""
        conv = await self.get_conversation(db, user_id, conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found.")

        clean_visibility = visibility.lower().strip()
        if clean_visibility not in ("private", "public_link"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Visibility must be either 'private' or 'public_link'.",
            )

        if clean_visibility == "public_link":
            if not conv.share_token:
                conv.share_token = secrets.token_urlsafe(32)
            conv.visibility = "public_link"
        else:
            conv.visibility = "private"
            conv.share_token = None

        await db.commit()
        await db.refresh(conv)
        return await self.get_sharing_status(db, user_id, conversation_id)

    async def get_public_shared_conversation(
        self, db: AsyncSession, share_token: str
    ) -> dict:
        """Retrieve public shared conversation details and messages safely."""
        if not share_token or not share_token.strip():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared chat not found or access has been revoked.",
            )

        stmt = select(Conversation).where(
            Conversation.share_token == share_token.strip(),
            Conversation.visibility == "public_link",
        )
        res = await db.execute(stmt)
        conv = res.scalar_one_or_none()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared chat not found or access has been revoked.",
            )

        # Get messages in chronological order
        stmt_msgs = (
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.asc())
        )
        res_msgs = await db.execute(stmt_msgs)
        messages = res_msgs.scalars().all()

        # Get assistant name
        assistant_name = None
        if conv.prompt_system_id:
            stmt_ps = select(PromptSystem.name).where(PromptSystem.id == conv.prompt_system_id)
            assistant_name = (await db.execute(stmt_ps)).scalar_one_or_none()
        elif conv.module_id:
            stmt_pm = select(PromptModule.name).where(PromptModule.id == conv.module_id)
            assistant_name = (await db.execute(stmt_pm)).scalar_one_or_none()

        return {
            "share_token": conv.share_token,
            "title": conv.title or (f"Chat with {assistant_name}" if assistant_name else "Shared Chat"),
            "assistant_name": assistant_name,
            "prompt_system_id": conv.prompt_system_id,
            "created_at": conv.created_at,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at,
                }
                for m in messages
            ],
        }

    async def copy_assistant_from_shared_chat(
        self, db: AsyncSession, share_token: str, new_owner_id: int
    ) -> PromptSystem:
        """Create a private copy of the Assistant powering the shared chat for the current user."""
        if not share_token or not share_token.strip():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared chat not found.",
            )

        stmt = select(Conversation).where(
            Conversation.share_token == share_token.strip(),
            Conversation.visibility == "public_link",
        )
        res = await db.execute(stmt)
        conv = res.scalar_one_or_none()
        if not conv or not conv.prompt_system_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No assistant found associated with this shared chat.",
            )

        stmt_sys = select(PromptSystem).where(
            PromptSystem.id == conv.prompt_system_id,
            PromptSystem.archived.is_(False),
        )
        original = (await db.execute(stmt_sys)).scalar_one_or_none()
        if not original:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Original Assistant is no longer available.",
            )

        new_prompt_system = PromptSystem(
            name=f"{original.name} (Copy)",
            description=original.description,
            owner_id=new_owner_id,
            instructions=original.instructions,
            variables=copy.deepcopy(original.variables) if original.variables is not None else dict(),
            examples=copy.deepcopy(original.examples) if original.examples is not None else list(),
            output_format=copy.deepcopy(original.output_format) if original.output_format is not None else dict(),
            modules=copy.deepcopy(original.modules) if original.modules is not None else list(),
            version=1,
            archived=False,
            visibility="private",
            share_token=None,
        )
        db.add(new_prompt_system)
        await db.flush()

        stmt_refs = select(ModuleReference).where(ModuleReference.prompt_system_id == original.id)
        original_refs = (await db.execute(stmt_refs)).scalars().all()

        for ref in original_refs:
            new_ref = ModuleReference(
                prompt_system_id=new_prompt_system.id,
                module_id=ref.module_id,
                input_mapping=copy.deepcopy(ref.input_mapping) if ref.input_mapping is not None else dict(),
                output_mapping=copy.deepcopy(ref.output_mapping) if ref.output_mapping is not None else dict(),
                enabled=ref.enabled,
            )
            db.add(new_ref)

        await db.commit()
        await db.refresh(new_prompt_system)
        return new_prompt_system

conversation_service = ConversationService()
