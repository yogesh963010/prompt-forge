"""History service layer for managing PromptRunHistory snapshots."""
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_run_history import PromptRunHistory


async def save_prompt_run_history(
    db: AsyncSession,
    user_id: int,
    prompt_system_id: int,
    prompt_system_name: str,
    final_prompt: str,
    module_id: Optional[int] = None,
    module_name: Optional[str] = None,
    runtime_variables: Optional[Dict[str, Any]] = None,
) -> PromptRunHistory:
    """Save an immutable snapshot of a successful Prompt Run."""
    history = PromptRunHistory(
        user_id=user_id,
        prompt_system_id=prompt_system_id,
        module_id=module_id,
        prompt_system_name=prompt_system_name,
        module_name=module_name,
        final_prompt=final_prompt,
        runtime_variables=runtime_variables if runtime_variables is not None else {},
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)
    return history


async def get_user_history(
    db: AsyncSession,
    user_id: int,
) -> List[PromptRunHistory]:
    """Retrieve all history items for the given user, ordered by created_at DESC."""
    stmt = (
        select(PromptRunHistory)
        .where(PromptRunHistory.user_id == user_id)
        .order_by(PromptRunHistory.created_at.desc(), PromptRunHistory.id.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_history_by_id(
    db: AsyncSession,
    history_id: int,
    user_id: int,
) -> PromptRunHistory:
    """Fetch a single history record with ownership verification."""
    stmt = select(PromptRunHistory).where(PromptRunHistory.id == history_id)
    result = await db.execute(stmt)
    history = result.scalar_one_or_none()

    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt History record not found.",
        )
    if history.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this Prompt History record.",
        )
    return history


async def delete_history_by_id(
    db: AsyncSession,
    history_id: int,
    user_id: int,
) -> None:
    """Delete a single history record with ownership verification."""
    history = await get_history_by_id(db=db, history_id=history_id, user_id=user_id)
    await db.delete(history)
    await db.commit()
