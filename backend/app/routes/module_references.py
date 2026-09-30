"""Module References API route handlers.

Routes are nested under /prompt-systems/{prompt_system_id}/modules to
clearly express ownership and scope.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.prompt_system import PromptSystem
from ..models.user import User
from ..schemas.module_reference import (
    ModuleReferenceCreate,
    ModuleReferenceResponse,
    ModuleReferenceUpdate,
)
from ..services.module_reference_service import (
    create_module_reference,
    delete_module_reference,
    get_module_by_id_for_owner,
    get_module_reference_by_id,
    list_module_references,
    update_module_reference,
)

router = APIRouter(
    prefix="/prompt-systems/{prompt_system_id}/modules",
    tags=["Module References"],
)


async def _get_owned_prompt_system(
    prompt_system_id: int,
    current_user: User,
    db: AsyncSession,
) -> PromptSystem:
    """Shared helper: fetch and verify ownership of a PromptSystem."""
    stmt = select(PromptSystem).where(PromptSystem.id == prompt_system_id)
    result = await db.execute(stmt)
    prompt_system = result.scalar_one_or_none()

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


def _build_response(reference) -> ModuleReferenceResponse:
    """Build a ModuleReferenceResponse, populating module_name, variables, and context from the joined module."""
    module_name = None
    module_variables = []
    module_input_context = []
    if reference.prompt_module:
        module_name = reference.prompt_module.name
        module_variables = reference.prompt_module.variables or []
        module_input_context = reference.prompt_module.input_context or []
    return ModuleReferenceResponse(
        id=reference.id,
        prompt_system_id=reference.prompt_system_id,
        module_id=reference.module_id,
        module_name=module_name,
        module_variables=module_variables,
        module_input_context=module_input_context,
        input_mapping=reference.input_mapping,
        output_mapping=reference.output_mapping,
        enabled=reference.enabled,
        created_at=reference.created_at,
        updated_at=reference.updated_at,
    )


@router.post(
    "",
    response_model=ModuleReferenceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Attach a Prompt Module to a Prompt System",
    description=(
        "Creates a ModuleReference linking a PromptModule to the given PromptSystem. "
        "The module is NOT duplicated; only a reference record is created."
    ),
)
async def attach_module_to_prompt_system(
    prompt_system_id: int,
    payload: ModuleReferenceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Attach a PromptModule to a PromptSystem via a new ModuleReference asynchronously."""
    # 1. Verify PromptSystem ownership
    await _get_owned_prompt_system(prompt_system_id, current_user, db)

    # 2. Verify PromptModule exists and belongs to the same user
    prompt_module = await get_module_by_id_for_owner(
        db=db, module_id=payload.module_id, owner_id=current_user.id
    )
    if not prompt_module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt Module not found or you do not have permission to use it.",
        )

    # 3. Create reference (unique constraint prevents duplicates)
    try:
        reference = await create_module_reference(
            db=db,
            prompt_system_id=prompt_system_id,
            data=payload,
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Prompt Module is already attached to the Prompt System.",
        )

    return _build_response(reference)


@router.get(
    "",
    response_model=List[ModuleReferenceResponse],
    status_code=status.HTTP_200_OK,
    summary="List Module References for a Prompt System",
    description="Returns all ModuleReferences attached to the given PromptSystem.",
)
async def list_prompt_system_modules(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all ModuleReferences for a PromptSystem asynchronously."""
    await _get_owned_prompt_system(prompt_system_id, current_user, db)
    references = await list_module_references(db=db, prompt_system_id=prompt_system_id)
    return [_build_response(ref) for ref in references]


@router.patch(
    "/{module_reference_id}",
    response_model=ModuleReferenceResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a Module Reference",
    description="Update input_mapping, output_mapping, or enabled state of a ModuleReference.",
)
async def update_prompt_system_module_reference(
    prompt_system_id: int,
    module_reference_id: int,
    payload: ModuleReferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update an existing ModuleReference asynchronously."""
    await _get_owned_prompt_system(prompt_system_id, current_user, db)

    reference = await get_module_reference_by_id(db=db, reference_id=module_reference_id)
    if not reference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module Reference not found.",
        )
    if reference.prompt_system_id != prompt_system_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module Reference not found.",
        )

    reference = await update_module_reference(db=db, reference=reference, data=payload)
    return _build_response(reference)


@router.delete(
    "/{module_reference_id}",
    status_code=status.HTTP_200_OK,
    summary="Detach a Prompt Module from a Prompt System",
    description=(
        "Removes the ModuleReference between the PromptSystem and the PromptModule. "
        "The PromptModule itself is NOT deleted and can be reused by other systems."
    ),
)
async def delete_prompt_system_module_reference(
    prompt_system_id: int,
    module_reference_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a ModuleReference without deleting the underlying PromptModule asynchronously."""
    await _get_owned_prompt_system(prompt_system_id, current_user, db)

    reference = await get_module_reference_by_id(db=db, reference_id=module_reference_id)
    if not reference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module Reference not found.",
        )
    if reference.prompt_system_id != prompt_system_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module Reference not found.",
        )

    await delete_module_reference(db=db, reference=reference)
    return {
        "message": "Module reference deleted successfully. The Prompt Module was not deleted.",
        "id": module_reference_id,
    }
