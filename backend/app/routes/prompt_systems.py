"""Prompt Systems API route handlers."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.prompt_system import (
    PromptSystemCreate,
    PromptSystemResponse,
    PromptSystemUpdate,
    VariableValidationResponse,
)
from ..schemas.sharing import SharingStatusResponse, SharingUpdateRequest
from ..services.prompt_system_service import (
    create_prompt_system,
    delete_prompt_system,
    duplicate_prompt_system,
    get_prompt_system_by_id,
    list_prompt_systems,
    set_prompt_system_archived_status,
    update_prompt_system,
)
from ..services.sharing_service import get_sharing_status, update_sharing_status
from ..utils.variable_parser import validate_prompt_variables

router = APIRouter(prefix="/prompt-systems", tags=["Prompt Systems"])


@router.post(
    "",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Prompt System",
    description="Creates a new Prompt System owned by the currently authenticated user.",
)
async def create_new_prompt_system(
    payload: PromptSystemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Prompt System asynchronously."""
    return await create_prompt_system(db=db, data=payload, owner_id=current_user.id)


@router.get(
    "",
    response_model=List[PromptSystemResponse],
    status_code=status.HTTP_200_OK,
    summary="List Prompt Systems",
    description="Returns Prompt Systems owned by the authenticated user with search, sort, and pagination.",
)
async def get_prompt_systems_library(
    search: Optional[str] = Query(None, description="Case-insensitive search by name and description"),
    sort: Optional[str] = Query(None, description="Ordering strategy, e.g. 'recent'"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    include_archived: bool = Query(False, description="Whether to include archived systems"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List Prompt Systems for the authenticated user asynchronously."""
    return await list_prompt_systems(
        db=db,
        owner_id=current_user.id,
        search=search,
        sort=sort,
        page=page,
        limit=limit,
        include_archived=include_archived,
    )


@router.get(
    "/{prompt_system_id}",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a Prompt System",
    description="Retrieve a single Prompt System owned by the currently authenticated user.",
)
async def get_single_prompt_system(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a Prompt System by ID asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this Prompt System.",
        )

    return prompt_system


@router.post(
    "/{prompt_system_id}/duplicate",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a Prompt System",
    description="Creates a duplicate of an existing Prompt System owned by the authenticated user.",
)
async def duplicate_existing_prompt_system(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate an existing Prompt System asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to duplicate this Prompt System.",
        )

    return await duplicate_prompt_system(
        db=db,
        original=prompt_system,
        owner_id=current_user.id,
    )


@router.patch(
    "/{prompt_system_id}/archive",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_200_OK,
    summary="Archive a Prompt System",
    description="Marks a Prompt System as archived without physically deleting it.",
)
async def archive_existing_prompt_system(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a Prompt System by ID asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to archive this Prompt System.",
        )

    return await set_prompt_system_archived_status(
        db=db,
        prompt_system=prompt_system,
        archived=True,
    )


@router.patch(
    "/{prompt_system_id}/unarchive",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_200_OK,
    summary="Unarchive a Prompt System",
    description="Marks an archived Prompt System as active.",
)
async def unarchive_existing_prompt_system(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unarchive a Prompt System by ID asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to unarchive this Prompt System.",
        )

    return await set_prompt_system_archived_status(
        db=db,
        prompt_system=prompt_system,
        archived=False,
    )


@router.post(
    "/{prompt_system_id}/variables/validate",
    response_model=VariableValidationResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate Prompt System variables",
    description="Validates configured variables against variables referenced in instructions.",
)
async def validate_variables_endpoint(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate Prompt System variables against instructions asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to validate variables for this Prompt System.",
        )

    validation_result = validate_prompt_variables(
        instructions=prompt_system.instructions,
        configured_variables=prompt_system.variables,
    )
    return VariableValidationResponse(**validation_result)


@router.put(
    "/{prompt_system_id}",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a Prompt System",
    description="Update an existing Prompt System owned by the authenticated user.",
)
async def update_existing_prompt_system(
    prompt_system_id: int,
    payload: PromptSystemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update editable fields of a Prompt System asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this Prompt System.",
        )

    return await update_prompt_system(db=db, prompt_system=prompt_system, data=payload)


@router.patch(
    "/{prompt_system_id}",
    response_model=PromptSystemResponse,
    status_code=status.HTTP_200_OK,
    summary="Partially update a Prompt System",
    description="Partially update an existing Prompt System (e.g. updating variables).",
)
async def patch_existing_prompt_system(
    prompt_system_id: int,
    payload: PromptSystemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update editable fields of a Prompt System asynchronously."""
    return await update_existing_prompt_system(
        prompt_system_id=prompt_system_id,
        payload=payload,
        current_user=current_user,
        db=db,
    )


@router.delete(
    "/{prompt_system_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a Prompt System",
    description="Delete a Prompt System owned by the authenticated user.",
)
async def delete_existing_prompt_system(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a Prompt System by ID asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this Prompt System.",
        )

    await delete_prompt_system(db=db, prompt_system=prompt_system)
    return {
        "message": "Prompt System deleted successfully.",
        "id": prompt_system_id,
    }


@router.get(
    "/{prompt_system_id}/sharing",
    response_model=SharingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Sharing Status",
    description="Retrieve sharing visibility and share link details for a Prompt System owned by the authenticated user.",
)
async def get_sharing_status_endpoint(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get sharing status for a Prompt System asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access sharing settings for this Prompt System.",
        )

    return get_sharing_status(prompt_system)


@router.patch(
    "/{prompt_system_id}/sharing",
    response_model=SharingStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Sharing Settings",
    description="Change the sharing visibility of a Prompt System owned by the authenticated user.",
)
async def update_sharing_status_endpoint(
    prompt_system_id: int,
    payload: SharingUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update sharing settings for a Prompt System asynchronously."""
    prompt_system = await get_prompt_system_by_id(db=db, prompt_system_id=prompt_system_id)
    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    if prompt_system.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify sharing settings for this Prompt System.",
        )

    return await update_sharing_status(
        db=db,
        prompt_system=prompt_system,
        visibility=payload.visibility,
    )
