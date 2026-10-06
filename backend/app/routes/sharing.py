"""Public sharing routes for PromptForge."""
from typing import Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.sharing import PublicSharedSystemResponse
from ..schemas.prompt_system import PromptSystemResponse
from ..schemas.prompt_run import PromptRunRequest, PromptRunResponse
from ..services.sharing_service import (
    get_public_shared_system_details,
    copy_shared_prompt_system,
    run_public_shared_system,
)
from ..services.conversation_service import conversation_service

router = APIRouter(prefix="/shared", tags=["Sharing"])


@router.get(
    "/chat/{share_token}",
    status_code=status.HTTP_200_OK,
    summary="Get Public Shared Chat",
    description="Retrieve public read-only details of a shared conversation without exposing credentials or other chats.",
)
async def get_public_shared_chat_endpoint(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    return await conversation_service.get_public_shared_conversation(db=db, share_token=share_token)


@router.post(
    "/chat/{share_token}/copy-assistant",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Copy Assistant From Shared Chat",
    description="Create a private copy of the Assistant that powers the shared chat, owned by the currently authenticated user.",
)
async def copy_assistant_from_shared_chat_endpoint(
    share_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await conversation_service.copy_assistant_from_shared_chat(
        db=db,
        share_token=share_token,
        new_owner_id=current_user.id,
    )


@router.get(
    "/{share_token}",
    response_model=PublicSharedSystemResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Public Shared Prompt System",
    description="Retrieve public details of a shared Prompt System without exposing owner or internal IDs.",
)
async def get_public_shared_system_endpoint(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    return await get_public_shared_system_details(db=db, share_token=share_token)


@router.post(
    "/{share_token}/copy",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Copy Public Shared Prompt System",
    description="Create a private copy of the shared Prompt System owned by the currently authenticated user.",
)
async def copy_shared_system_endpoint(
    share_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await copy_shared_prompt_system(
        db=db,
        share_token=share_token,
        new_owner_id=current_user.id,
    )


@router.post(
    "/{share_token}/run",
    response_model=PromptRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Run Public Shared Prompt System",
    description="Execute a public shared Prompt System using runtime variables.",
)
async def run_public_shared_system_endpoint(
    share_token: str,
    payload: Optional[PromptRunRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    request_data = payload if payload is not None else PromptRunRequest(variables={})
    return await run_public_shared_system(
        db=db,
        share_token=share_token,
        request=request_data,
    )
