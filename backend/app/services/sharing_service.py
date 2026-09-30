"""Sharing service layer for managing public link sharing and copying."""
import copy
import secrets
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..models.module_reference import ModuleReference
from ..models.prompt_module import PromptModule
from ..schemas.sharing import (
    PublicSharedModule,
    PublicSharedSystemResponse,
    SharingStatusResponse,
)
from ..schemas.prompt_run import PromptRunRequest, PromptRunResponse
from ..services.run_service import run_prompt_system


def generate_share_token() -> str:
    """Generate a secure, unpredictable, URL-safe share token."""
    return secrets.token_urlsafe(32)


def get_sharing_status(prompt_system: PromptSystem) -> SharingStatusResponse:
    """Return current sharing status and URL for a Prompt System."""
    if prompt_system.visibility == "public_link" and prompt_system.share_token:
        return SharingStatusResponse(
            visibility="public_link",
            share_token=prompt_system.share_token,
            share_url=f"/shared/{prompt_system.share_token}",
        )
    return SharingStatusResponse(
        visibility="private",
        share_token=None,
        share_url=None,
    )


async def update_sharing_status(
    db: AsyncSession,
    prompt_system: PromptSystem,
    visibility: str,
) -> SharingStatusResponse:
    """Update visibility mode of a Prompt System.
    
    Generates a share_token if switching to public_link and none exists.
    """
    clean_visibility = visibility.lower().strip()
    if clean_visibility not in ("private", "public_link"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visibility must be either 'private' or 'public_link'.",
        )

    if clean_visibility == "public_link":
        if not prompt_system.share_token:
            prompt_system.share_token = generate_share_token()
        prompt_system.visibility = "public_link"
    else:
        prompt_system.visibility = "private"

    await db.commit()
    await db.refresh(prompt_system)
    return get_sharing_status(prompt_system)


async def get_public_prompt_system_by_token(
    db: AsyncSession,
    share_token: str,
) -> PromptSystem:
    """Find a public Prompt System by share token or raise 404."""
    if not share_token or not share_token.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared Prompt System not found.",
        )

    stmt = select(PromptSystem).where(
        PromptSystem.share_token == share_token.strip(),
        PromptSystem.visibility == "public_link",
        PromptSystem.archived.is_(False),
    )
    result = await db.execute(stmt)
    prompt_system = result.scalar_one_or_none()

    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared Prompt System not found.",
        )
    return prompt_system


async def get_public_shared_system_details(
    db: AsyncSession,
    share_token: str,
) -> PublicSharedSystemResponse:
    """Retrieve public shared details without exposing owner IDs or private data."""
    prompt_system = await get_public_prompt_system_by_token(db=db, share_token=share_token)

    # Fetch attached modules
    stmt_modules = (
        select(PromptModule)
        .join(ModuleReference, ModuleReference.module_id == PromptModule.id)
        .where(
            ModuleReference.prompt_system_id == prompt_system.id,
            ModuleReference.enabled.is_(True),
        )
    )
    res_modules = await db.execute(stmt_modules)
    modules = res_modules.scalars().all()

    attached_modules = [
        PublicSharedModule(
            id=m.id,
            name=m.name,
            description=m.description,
            variables=m.variables,
        )
        for m in modules
    ]

    return PublicSharedSystemResponse(
        share_token=prompt_system.share_token or "",
        name=prompt_system.name,
        description=prompt_system.description,
        instructions=prompt_system.instructions,
        variables=prompt_system.variables,
        examples=prompt_system.examples,
        output_format=prompt_system.output_format,
        modules=prompt_system.modules,
        attached_modules=attached_modules,
        created_at=prompt_system.created_at,
        updated_at=prompt_system.updated_at,
    )


async def copy_shared_prompt_system(
    db: AsyncSession,
    share_token: str,
    new_owner_id: int,
) -> PromptSystem:
    """Create a private copy of a public shared Prompt System owned by new_owner_id.
    
    Preserves instructions, variables, examples, output_format, modules,
    and all attached ModuleReferences.
    """
    original = await get_public_prompt_system_by_token(db=db, share_token=share_token)

    new_prompt_system = PromptSystem(
        name=f"{original.name} (Copy)",
        description=original.description,
        owner_id=new_owner_id,
        instructions=original.instructions,
        variables=copy.deepcopy(original.variables) if original.variables is not None else dict(),
        examples=copy.deepcopy(original.examples) if original.examples is not None else list(),
        output_format=copy.deepcopy(original.output_format) if original.output_format is not None else dict(),
        modules=copy.deepcopy(original.modules) if original.modules is not None else list(),
        version=1,
        archived=False,
        visibility="private",
        share_token=None,
    )
    db.add(new_prompt_system)
    await db.flush()

    # Copy module references
    stmt_refs = select(ModuleReference).where(ModuleReference.prompt_system_id == original.id)
    res_refs = await db.execute(stmt_refs)
    original_refs = res_refs.scalars().all()

    for ref in original_refs:
        new_ref = ModuleReference(
            prompt_system_id=new_prompt_system.id,
            module_id=ref.module_id,
            input_mapping=copy.deepcopy(ref.input_mapping) if ref.input_mapping is not None else dict(),
            output_mapping=copy.deepcopy(ref.output_mapping) if ref.output_mapping is not None else dict(),
            enabled=ref.enabled,
        )
        db.add(new_ref)

    await db.commit()
    await db.refresh(new_prompt_system)
    return new_prompt_system


async def run_public_shared_system(
    db: AsyncSession,
    share_token: str,
    request: PromptRunRequest,
) -> PromptRunResponse:
    """Run a public shared prompt system reusing the existing Prompt Run service."""
    prompt_system = await get_public_prompt_system_by_token(db=db, share_token=share_token)
    return await run_prompt_system(
        db=db,
        prompt_system_id=prompt_system.id,
        user_id=prompt_system.owner_id,
        request=request,
    )
