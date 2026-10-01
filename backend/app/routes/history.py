"""History API route handlers for Branch 21: Prompt History."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.prompt_run_history import (
    PromptRunHistoryItemResponse,
    PromptRunHistoryListResponse,
)
from ..services.history_service import (
    get_user_history,
    get_history_by_id,
    delete_history_by_id,
)

router = APIRouter(
    prefix="/history",
    tags=["Prompt History"],
)


@router.get(
    "",
    response_model=PromptRunHistoryListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Prompt Run History",
    description="Retrieve all prompt run history records for the authenticated user, ordered by most recent first.",
)
async def get_history_list_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptRunHistoryListResponse:
    """Retrieve history records for the current user."""
    items = await get_user_history(db=db, user_id=current_user.id)
    return PromptRunHistoryListResponse(items=items)


@router.get(
    "/{history_id}",
    response_model=PromptRunHistoryItemResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Single History Record",
    description="Retrieve a single prompt run history record by ID. Only accessible by the owner.",
)
async def get_history_item_endpoint(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptRunHistoryItemResponse:
    """Retrieve a single history record with ownership check."""
    return await get_history_by_id(db=db, history_id=history_id, user_id=current_user.id)


@router.delete(
    "/{history_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete History Record",
    description="Delete a prompt run history record by ID. Only accessible by the owner.",
)
async def delete_history_item_endpoint(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a history record with ownership check."""
    await delete_history_by_id(db=db, history_id=history_id, user_id=current_user.id)
    return {
        "message": "Prompt History record deleted successfully.",
        "id": history_id,
    }
