"""Prompt Modules API route handlers."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.prompt_module import (
    PromptModuleCreate,
    PromptModuleResponse,
    PromptModuleUpdate,
)
from ..services.module_service import (
    create_module,
    delete_module,
    get_module_by_id,
    list_modules,
    update_module,
)

router = APIRouter(prefix="/modules", tags=["Prompt Modules"])


@router.post(
    "",
    response_model=PromptModuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Prompt Module",
    description="Creates a new reusable Prompt Module owned by the currently authenticated user.",
)
async def create_new_module(
    payload: PromptModuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Prompt Module asynchronously."""
    return await create_module(db=db, data=payload, owner_id=current_user.id)


@router.get(
    "",
    response_model=List[PromptModuleResponse],
    status_code=status.HTTP_200_OK,
    summary="List Prompt Modules",
    description="Returns Prompt Modules owned by the currently authenticated user.",
)
async def get_modules_library(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List Prompt Modules for the authenticated user asynchronously."""
    return await list_modules(db=db, owner_id=current_user.id)


@router.get(
    "/{module_id}",
    response_model=PromptModuleResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a Prompt Module",
    description="Retrieve a single Prompt Module owned by the currently authenticated user.",
)
async def get_single_module(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a Prompt Module by ID asynchronously."""
    module = await get_module_by_id(db=db, module_id=module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt Module not found.",
        )

    if module.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this module.",
        )

    return module


@router.patch(
    "/{module_id}",
    response_model=PromptModuleResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a Prompt Module",
    description="Partially update an existing Prompt Module owned by the authenticated user.",
)
@router.put(
    "/{module_id}",
    response_model=PromptModuleResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a Prompt Module",
    description="Update an existing Prompt Module owned by the authenticated user.",
)
async def update_existing_module(
    module_id: int,
    payload: PromptModuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update editable fields of a Prompt Module asynchronously."""
    module = await get_module_by_id(db=db, module_id=module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt Module not found.",
        )

    if module.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this module.",
        )

    return await update_module(db=db, module=module, data=payload)


@router.delete(
    "/{module_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a Prompt Module",
    description="Delete a Prompt Module owned by the authenticated user.",
)
async def delete_existing_module(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a Prompt Module by ID asynchronously."""
    module = await get_module_by_id(db=db, module_id=module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt Module not found.",
        )

    if module.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this module.",
        )

    await delete_module(db=db, module=module)
    return {
        "message": "Prompt Module deleted successfully.",
        "id": module_id,
    }
