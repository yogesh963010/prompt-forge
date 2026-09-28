"""Prompt System Versions API route handlers."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.prompt_version import (
    PromptVersionCompareResponse,
    PromptVersionCreate,
    PromptVersionResponse,
    PromptVersionRestoreResponse,
)
from ..services.version_service import (
    compare_versions,
    create_version,
    get_version,
    list_versions,
    restore_version,
)

router = APIRouter(
    prefix="/prompt-systems/{prompt_system_id}/versions",
    tags=["Prompt Versions"],
)


@router.get(
    "",
    response_model=List[PromptVersionResponse],
    status_code=status.HTTP_200_OK,
    summary="List versions for a Prompt System",
    description="Returns all historical version snapshots for the Prompt System, sorted newest first.",
)
async def get_prompt_system_versions(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List version snapshots for an owned Prompt System asynchronously."""
    return await list_versions(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=current_user.id,
    )


@router.post(
    "",
    response_model=PromptVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new version snapshot",
    description="Captures a historical snapshot of the CURRENT Prompt System configuration with an optional change note.",
)
async def create_new_version(
    prompt_system_id: int,
    payload: Optional[PromptVersionCreate] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new version snapshot asynchronously from current DB configuration."""
    return await create_version(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=current_user.id,
        data=payload,
    )


@router.get(
    "/compare",
    response_model=PromptVersionCompareResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare two versions",
    description="Returns a structured field-by-field diff between two version snapshots of a Prompt System.",
)
async def compare_prompt_system_versions(
    prompt_system_id: int,
    version_a: int = Query(..., description="First version number or ID to compare"),
    version_b: int = Query(..., description="Second version number or ID to compare"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare two version snapshots asynchronously."""
    return await compare_versions(
        db=db,
        prompt_system_id=prompt_system_id,
        version_a=version_a,
        version_b=version_b,
        user_id=current_user.id,
    )


@router.get(
    "/{version_id}",
    response_model=PromptVersionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a version snapshot",
    description="Retrieves a single historical version snapshot by ID or version number.",
)
async def get_single_version(
    prompt_system_id: int,
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single version snapshot asynchronously."""
    return await get_version(
        db=db,
        prompt_system_id=prompt_system_id,
        version_identifier=version_id,
        user_id=current_user.id,
    )


@router.post(
    "/{version_id}/restore",
    response_model=PromptVersionRestoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Restore a previous version",
    description="Restores the specified historical snapshot into the current Prompt System and creates a new version to preserve append-only history.",
)
async def restore_previous_version(
    prompt_system_id: int,
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a previous version snapshot asynchronously."""
    return await restore_version(
        db=db,
        prompt_system_id=prompt_system_id,
        version_id=version_id,
        user_id=current_user.id,
    )
