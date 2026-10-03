from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.session import get_db
from ..schemas.conversation import AssistantContextResponse
from ..services.assistant_context_service import assistant_context_service
from .auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/assistants", tags=["Assistants"])

@router.get("/{assistant_id}/context", response_model=AssistantContextResponse)
async def get_assistant_context(
    assistant_id: int,
    conversation_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await assistant_context_service.get_assistant_context(db, current_user.id, assistant_id, conversation_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
