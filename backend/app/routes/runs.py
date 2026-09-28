"""Prompt Run API route handlers for Branch 17: Prompt Run."""
from typing import Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.prompt_run import PromptRunRequest, PromptRunResponse
from ..services.run_service import run_prompt_system

router = APIRouter(
    prefix="/prompt-systems",
    tags=["Prompt Run"],
)


@router.post(
    "/{prompt_system_id}/run",
    response_model=PromptRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Run a Prompt System with runtime variables",
    description=(
        "Executes the Prompt Run workflow: validates runtime variables, "
        "assembles the prompt via the existing Composer, resolves runtime variables, "
        "and returns the final resolved prompt ready for preview or destination selection."
    ),
)
async def run_prompt_system_endpoint(
    prompt_system_id: int,
    payload: Optional[PromptRunRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromptRunResponse:
    """Run a Prompt System with runtime variable substitution."""
    request_data = payload if payload is not None else PromptRunRequest(variables={})
    return await run_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=current_user.id,
        request=request_data,
    )
