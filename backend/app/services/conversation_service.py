from typing import List, Optional
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.conversation import Conversation, Message
from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..schemas.conversation import ConversationCreate, MessageCreate

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

conversation_service = ConversationService()
