"""PromptModule service layer for managing PromptModule database records asynchronously."""
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_module import PromptModule
from ..schemas.prompt_module import PromptModuleCreate, PromptModuleUpdate


async def create_module(
    db: AsyncSession,
    data: PromptModuleCreate,
    owner_id: int,
) -> PromptModule:
    """Create a new PromptModule associated with an authenticated owner asynchronously."""
    prompt_module = PromptModule(
        name=data.name,
        description=data.description,
        owner_id=owner_id,
        instructions=data.instructions,
        variables=data.variables,
        input_context=data.input_context,
        output_contract=data.output_contract,
        examples=data.examples,
    )
    db.add(prompt_module)
    await db.commit()
    await db.refresh(prompt_module)
    return prompt_module


async def get_module_by_id(
    db: AsyncSession,
    module_id: int,
) -> Optional[PromptModule]:
    """Retrieve a PromptModule by its primary key ID asynchronously."""
    stmt = select(PromptModule).where(PromptModule.id == module_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_module(
    db: AsyncSession,
    module_id: int,
) -> Optional[PromptModule]:
    """Alias for get_module_by_id."""
    return await get_module_by_id(db=db, module_id=module_id)


async def list_modules(
    db: AsyncSession,
    owner_id: int,
) -> List[PromptModule]:
    """List PromptModules owned by the user asynchronously."""
    stmt = (
        select(PromptModule)
        .where(PromptModule.owner_id == owner_id)
        .order_by(PromptModule.updated_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_module(
    db: AsyncSession,
    module: PromptModule,
    data: PromptModuleUpdate,
) -> PromptModule:
    """Update editable fields of an existing PromptModule asynchronously.

    Prevents modifying immutable fields: id, owner_id, created_at, updated_at.
    """
    update_data = data.model_dump(exclude_unset=True)
    immutable_fields = {"id", "owner_id", "created_at", "updated_at"}

    from sqlalchemy.orm.attributes import flag_modified

    for field, value in update_data.items():
        if field not in immutable_fields and hasattr(module, field):
            setattr(module, field, value)
            if field in {"input_context", "variables", "output_contract", "examples"}:
                flag_modified(module, field)

    await db.commit()
    await db.refresh(module)
    return module


async def delete_module(
    db: AsyncSession,
    module: PromptModule,
) -> None:
    """Delete a PromptModule from the database asynchronously."""
    await db.delete(module)
    await db.commit()
