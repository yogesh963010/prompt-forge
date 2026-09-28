"""PromptVersion service layer for managing and restoring Prompt System version snapshots."""
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.module_reference import ModuleReference
from ..models.prompt_system import PromptSystem
from ..models.prompt_version import PromptVersion
from ..schemas.prompt_version import PromptVersionCreate


async def get_owned_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> PromptSystem:
    """Fetch and verify ownership of a PromptSystem."""
    stmt = select(PromptSystem).where(PromptSystem.id == prompt_system_id)
    result = await db.execute(stmt)
    prompt_system = result.scalar_one_or_none()

    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )
    if prompt_system.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this Prompt System.",
        )
    return prompt_system


async def create_prompt_system_snapshot(
    db: AsyncSession,
    prompt_system: PromptSystem,
) -> Dict[str, Any]:
    """Capture a deterministic configuration snapshot of a PromptSystem.

    Preserves core instructions, variables, examples, output_format, and
    attached module references with their input/output mappings and enabled states.
    Excludes runtime data, secrets, or temporary state.
    """
    stmt_modules = (
        select(ModuleReference)
        .where(ModuleReference.prompt_system_id == prompt_system.id)
        .options(selectinload(ModuleReference.prompt_module))
        .order_by(ModuleReference.id.asc())
    )
    result_modules = await db.execute(stmt_modules)
    references = list(result_modules.scalars().all())

    modules_snapshot: List[Dict[str, Any]] = []
    for ref in references:
        modules_snapshot.append({
            "module_id": ref.module_id,
            "module_name": ref.prompt_module.name if ref.prompt_module else None,
            "input_mapping": ref.input_mapping,
            "output_mapping": ref.output_mapping,
            "enabled": ref.enabled,
        })

    snapshot = {
        "name": prompt_system.name,
        "description": prompt_system.description,
        "instructions": prompt_system.instructions,
        "variables": prompt_system.variables if prompt_system.variables is not None else [],
        "examples": prompt_system.examples if prompt_system.examples is not None else [],
        "output_format": prompt_system.output_format,
        "modules": modules_snapshot,
    }
    return snapshot


async def create_version(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
    data: Optional[PromptVersionCreate] = None,
) -> PromptVersion:
    """Create a new historical version snapshot from the CURRENT Prompt System configuration."""
    prompt_system = await get_owned_prompt_system(db, prompt_system_id, user_id)

    # Calculate next sequential version number for this prompt system
    stmt_max = select(func.coalesce(func.max(PromptVersion.version_number), 0)).where(
        PromptVersion.prompt_system_id == prompt_system_id
    )
    res_max = await db.execute(stmt_max)
    max_ver = res_max.scalar() or 0
    next_ver = max_ver + 1

    # Generate snapshot from current database state
    snapshot = await create_prompt_system_snapshot(db, prompt_system)

    change_note = data.change_note if data and data.change_note else None

    version = PromptVersion(
        prompt_system_id=prompt_system.id,
        version_number=next_ver,
        configuration_snapshot=snapshot,
        change_note=change_note,
        created_by=user_id,
    )
    db.add(version)

    # Sync prompt_system.version
    prompt_system.version = next_ver

    await db.commit()
    await db.refresh(version)
    return version


async def list_versions(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> List[PromptVersion]:
    """List all version snapshots for an owned PromptSystem, newest first."""
    await get_owned_prompt_system(db, prompt_system_id, user_id)

    stmt = (
        select(PromptVersion)
        .where(PromptVersion.prompt_system_id == prompt_system_id)
        .order_by(PromptVersion.version_number.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_version(
    db: AsyncSession,
    prompt_system_id: int,
    version_identifier: int,
    user_id: int,
) -> PromptVersion:
    """Retrieve a single version snapshot by ID or version_number."""
    await get_owned_prompt_system(db, prompt_system_id, user_id)

    # First look up by primary key ID or version_number belonging to this prompt system
    stmt = select(PromptVersion).where(
        PromptVersion.prompt_system_id == prompt_system_id,
        (PromptVersion.id == version_identifier) | (PromptVersion.version_number == version_identifier),
    )
    result = await db.execute(stmt)
    version = result.scalar_one_or_none()

    if not version:
        # Check if version exists at all under another system
        stmt_any = select(PromptVersion).where(
            (PromptVersion.id == version_identifier) | (PromptVersion.version_number == version_identifier)
        )
        res_any = await db.execute(stmt_any)
        any_ver = res_any.scalar_one_or_none()
        if any_ver and any_ver.prompt_system_id != prompt_system_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Version not found in this Prompt System.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version_identifier} not found.",
        )

    return version


async def compare_versions(
    db: AsyncSession,
    prompt_system_id: int,
    version_a: int,
    version_b: int,
    user_id: int,
) -> Dict[str, Any]:
    """Compare two version snapshots of a Prompt System."""
    ver_a = await get_version(db, prompt_system_id, version_a, user_id)
    ver_b = await get_version(db, prompt_system_id, version_b, user_id)

    snap_a = ver_a.configuration_snapshot or {}
    snap_b = ver_b.configuration_snapshot or {}

    fields = [
        "name",
        "description",
        "instructions",
        "variables",
        "examples",
        "output_format",
        "modules",
    ]

    changes: Dict[str, Any] = {}
    for f in fields:
        before = snap_a.get(f)
        after = snap_b.get(f)
        changed = (before != after)
        changes[f] = {
            "changed": changed,
            "before": before,
            "after": after,
        }

    return {
        "version_a": ver_a.version_number,
        "version_b": ver_b.version_number,
        "changes": changes,
    }


async def restore_version(
    db: AsyncSession,
    prompt_system_id: int,
    version_id: int,
    user_id: int,
) -> Dict[str, Any]:
    """Restore a previous version snapshot into the current Prompt System.

    Preserves full append-only history by creating a new version containing
    the restored configuration.
    """
    prompt_system = await get_owned_prompt_system(db, prompt_system_id, user_id)
    target_version = await get_version(db, prompt_system_id, version_id, user_id)

    snapshot = target_version.configuration_snapshot or {}

    # 1. Update Current Prompt System configuration
    if "name" in snapshot and snapshot["name"]:
        prompt_system.name = snapshot["name"]
    prompt_system.description = snapshot.get("description")
    prompt_system.instructions = snapshot.get("instructions")
    prompt_system.variables = snapshot.get("variables", [])
    prompt_system.examples = snapshot.get("examples", [])
    prompt_system.output_format = snapshot.get("output_format")

    # 2. Reconcile module references
    if "modules" in snapshot:
        # Delete existing module references
        await db.execute(
            delete(ModuleReference).where(ModuleReference.prompt_system_id == prompt_system_id)
        )
        # Restore module references from snapshot
        for mod in snapshot.get("modules", []):
            ref = ModuleReference(
                prompt_system_id=prompt_system.id,
                module_id=mod["module_id"],
                input_mapping=mod.get("input_mapping"),
                output_mapping=mod.get("output_mapping"),
                enabled=mod.get("enabled", True),
            )
            db.add(ref)

    # 3. Calculate next sequential version number
    stmt_max = select(func.coalesce(func.max(PromptVersion.version_number), 0)).where(
        PromptVersion.prompt_system_id == prompt_system_id
    )
    res_max = await db.execute(stmt_max)
    max_ver = res_max.scalar() or 0
    new_version_number = max_ver + 1

    prompt_system.version = new_version_number

    # 4. Create new version recording the restore action
    new_version = PromptVersion(
        prompt_system_id=prompt_system.id,
        version_number=new_version_number,
        configuration_snapshot=dict(snapshot),
        change_note=f"Restored from Version {target_version.version_number}",
        created_by=user_id,
    )
    db.add(new_version)

    await db.commit()
    await db.refresh(prompt_system)
    await db.refresh(new_version)

    return {
        "message": f"Successfully restored Version {target_version.version_number}.",
        "prompt_system_id": prompt_system.id,
        "restored_from_version": target_version.version_number,
        "new_version_number": new_version_number,
        "version": new_version,
    }
