"""Prompt Composer API route handlers."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.composer import ComposerResponse
from ..services.composer_service import compose_prompt_system

router = APIRouter(
    prefix="/prompt-systems",
    tags=["Composer"],
)


@router.post(
    "/{prompt_system_id}/compose",
    response_model=ComposerResponse,
    status_code=status.HTTP_200_OK,
    summary="Compose final prompt for a Prompt System",
)
async def compose_prompt(
    prompt_system_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComposerResponse:
    """Compose a Prompt System into a deterministic final prompt text.

    Combines core instructions, variables, examples, attached and enabled modules
    (respecting configured input/output boundaries), and output requirements.
    """
    composed_text = await compose_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=current_user.id,
    )
    return ComposerResponse(
        prompt_system_id=prompt_system_id,
        prompt=composed_text,
    )
