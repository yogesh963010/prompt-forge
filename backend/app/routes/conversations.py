from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.conversation import ConversationCreate, ConversationRead, MessageCreate, MessageRead
from ..services.conversation_service import conversation_service
from ..dependencies.auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/conversations", tags=["Conversations"])

@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conv_in: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await conversation_service.create_conversation(db, current_user.id, conv_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=List[ConversationRead])
async def get_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await conversation_service.get_conversations(db, current_user.id)

@router.get("/{conversation_id}", response_model=ConversationRead)
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = await conversation_service.get_conversation(db, current_user.id, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await conversation_service.delete_conversation(db, current_user.id, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")

@router.get("/{conversation_id}/messages", response_model=List[MessageRead])
async def get_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await conversation_service.get_messages(db, current_user.id, conversation_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{conversation_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def create_message(
    conversation_id: int,
    msg_in: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await conversation_service.create_message(db, current_user.id, conversation_id, msg_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{conversation_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    conversation_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await conversation_service.delete_message(db, current_user.id, conversation_id, message_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found")
