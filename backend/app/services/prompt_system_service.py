"""PromptSystem service layer for managing PromptSystem database records asynchronously."""
import copy
from typing import List, Optional
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..schemas.prompt_system import PromptSystemCreate, PromptSystemUpdate


async def create_prompt_system(
    db: AsyncSession,
    data: PromptSystemCreate,
    owner_id: int,
) -> PromptSystem:
    """Create a new PromptSystem associated with an authenticated owner asynchronously."""
    prompt_system = PromptSystem(
        name=data.name,
        description=data.description,
        owner_id=owner_id,
        instructions=data.instructions,
        variables=data.variables,
        examples=data.examples,
        output_format=data.output_format,
        modules=data.modules,
        ai_provider=data.ai_provider,
        model=data.model,
    )
    db.add(prompt_system)
    await db.commit()
    await db.refresh(prompt_system)
    return prompt_system


async def get_prompt_system_by_id(
    db: AsyncSession,
    prompt_system_id: int,
) -> Optional[PromptSystem]:
    """Retrieve a PromptSystem by its primary key ID asynchronously."""
    stmt = select(PromptSystem).where(PromptSystem.id == prompt_system_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_prompt_systems(
    db: AsyncSession,
    owner_id: int,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    include_archived: bool = False,
) -> List[PromptSystem]:
    """List Prompt Systems owned by the user with filtering, search, sorting, and pagination asynchronously."""
    stmt = select(PromptSystem).where(PromptSystem.owner_id == owner_id)

    # Filter archived records unless include_archived is requested
    if not include_archived:
        stmt = stmt.where(PromptSystem.archived.is_(False))

    # Case-insensitive search on name and description
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                PromptSystem.name.ilike(term),
                PromptSystem.description.ilike(term),
            )
        )

    # Ordering: sort=recent orders by updated_at descending
    if sort == "recent":
        stmt = stmt.order_by(PromptSystem.updated_at.desc())
    else:
        stmt = stmt.order_by(PromptSystem.updated_at.desc())

    # Pagination
    offset = max(0, (page - 1) * limit)
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def duplicate_prompt_system(
    db: AsyncSession,
    original: PromptSystem,
    owner_id: int,
) -> PromptSystem:
    """Duplicate an existing Prompt System, assigning version 1 and a copy name asynchronously."""
    duplicated_name = f"{original.name} (Copy)"
    new_prompt_system = PromptSystem(
        name=duplicated_name,
        description=original.description,
        owner_id=owner_id,
        instructions=original.instructions,
        variables=copy.deepcopy(original.variables) if original.variables is not None else dict(),
        examples=copy.deepcopy(original.examples) if original.examples is not None else list(),
        output_format=copy.deepcopy(original.output_format) if original.output_format is not None else dict(),
        modules=copy.deepcopy(original.modules) if original.modules is not None else list(),
        version=1,
        archived=False,
        ai_provider=original.ai_provider,
        model=original.model,
    )
    db.add(new_prompt_system)
    await db.commit()
    await db.refresh(new_prompt_system)
    return new_prompt_system


async def set_prompt_system_archived_status(
    db: AsyncSession,
    prompt_system: PromptSystem,
    archived: bool,
) -> PromptSystem:
    """Set the archived status of a Prompt System asynchronously."""
    prompt_system.archived = archived
    await db.commit()
    await db.refresh(prompt_system)
    return prompt_system


async def update_prompt_system(
    db: AsyncSession,
    prompt_system: PromptSystem,
    data: PromptSystemUpdate,
) -> PromptSystem:
    """Update editable fields of an existing PromptSystem asynchronously.
    
    Prevents modifying immutable fields: id, owner_id, created_at, updated_at.
    """
    update_data = data.model_dump(exclude_unset=True)
    immutable_fields = {"id", "owner_id", "created_at", "updated_at"}

    for field, value in update_data.items():
        if field not in immutable_fields and hasattr(prompt_system, field):
            setattr(prompt_system, field, value)

    await db.commit()
    await db.refresh(prompt_system)
    return prompt_system


async def delete_prompt_system(
    db: AsyncSession,
    prompt_system: PromptSystem,
) -> None:
    """Delete a PromptSystem from the database asynchronously."""
    await db.delete(prompt_system)
    await db.commit()
