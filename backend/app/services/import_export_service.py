"""Import/Export service for PromptForge Assistant configuration."""
import copy
import json
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..models.module_reference import ModuleReference

EXPORT_FORMAT = "promptforge"
EXPORT_VERSION = "1.0"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

async def export_prompt_system(
    db: AsyncSession,
    prompt_system: PromptSystem,
) -> Dict[str, Any]:
    """Build a portable, safe JSON export of an Assistant configuration.

    Excludes: owner IDs, share tokens, API keys, credentials, chat history.
    Includes: name, description, instructions, variables, examples,
              output_format, modules config, and attached sub-assistant definitions.
    """
    # Fetch attached sub-assistants (PromptModules) via ModuleReferences
    stmt = (
        select(PromptModule, ModuleReference)
        .join(ModuleReference, ModuleReference.module_id == PromptModule.id)
        .where(ModuleReference.prompt_system_id == prompt_system.id)
    )
    result = await db.execute(stmt)
    rows = result.all()

    sub_assistants = []
    for module, ref in rows:
        sub_assistants.append({
            "name": module.name,
            "description": module.description,
            "instructions": module.instructions,
            "variables": copy.deepcopy(module.variables) if module.variables is not None else [],
            "input_context": copy.deepcopy(module.input_context) if module.input_context is not None else [],
            "output_contract": copy.deepcopy(module.output_contract) if module.output_contract is not None else None,
            "examples": copy.deepcopy(module.examples) if module.examples is not None else [],
            # Reference-level settings
            "input_mapping": copy.deepcopy(ref.input_mapping) if ref.input_mapping is not None else {},
            "output_mapping": copy.deepcopy(ref.output_mapping) if ref.output_mapping is not None else {},
            "enabled": ref.enabled,
        })

    vars_raw = prompt_system.variables
    if isinstance(vars_raw, list):
        vars_payload = copy.deepcopy(vars_raw)
    elif isinstance(vars_raw, dict):
        vars_payload = list(vars_raw.values()) if vars_raw else []
    else:
        vars_payload = []

    payload = {
        "format": EXPORT_FORMAT,
        "version": EXPORT_VERSION,
        "type": "assistant",
        "assistant": {
            "name": prompt_system.name,
            "description": prompt_system.description,
            "instructions": prompt_system.instructions,
            "ai_provider": prompt_system.ai_provider,
            "model": prompt_system.model,
        },
        "variables": vars_payload,
        "examples": copy.deepcopy(prompt_system.examples) if prompt_system.examples is not None else [],
        "output_format": copy.deepcopy(prompt_system.output_format) if prompt_system.output_format is not None else {},
        "modules_config": copy.deepcopy(prompt_system.modules) if prompt_system.modules is not None else [],
        "sub_assistants": sub_assistants,
    }
    return payload


# ---------------------------------------------------------------------------
# Validate import payload
# ---------------------------------------------------------------------------

def validate_import_payload(data: Dict[str, Any]) -> None:
    """Validate a PromptForge import payload. Raises HTTPException on failure."""
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Import payload must be a JSON object.",
        )

    if data.get("format") != EXPORT_FORMAT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported format '{data.get('format')}'. Expected '{EXPORT_FORMAT}'.",
        )

    if data.get("version") != EXPORT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported version '{data.get('version')}'. Expected '{EXPORT_VERSION}'.",
        )

    if data.get("type") != "assistant":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported type '{data.get('type')}'. Only 'assistant' imports are supported.",
        )

    assistant = data.get("assistant")
    if not isinstance(assistant, dict) or not assistant.get("name"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Import payload must contain an 'assistant' object with a non-empty 'name'.",
        )

    # Validate variables if present
    variables = data.get("variables", [])
    if isinstance(variables, dict):
        data["variables"] = list(variables.values())
    elif not isinstance(variables, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'variables' must be an array.",
        )

    # Validate sub_assistants if present
    sub_assistants = data.get("sub_assistants", [])
    if not isinstance(sub_assistants, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'sub_assistants' must be an array.",
        )
    for i, sa_data in enumerate(sub_assistants):
        if not isinstance(sa_data, dict) or not sa_data.get("name"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"sub_assistants[{i}] must be an object with a non-empty 'name'.",
            )


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

async def import_prompt_system(
    db: AsyncSession,
    data: Dict[str, Any],
    owner_id: int,
) -> PromptSystem:
    """Create a new private Assistant from an import payload.

    - Validates the payload
    - Generates new IDs (never reuses originals)
    - Assigns current user as owner
    - Handles duplicate names safely
    - Creates sub-assistants and their module references
    """
    validate_import_payload(data)

    assistant_data = data["assistant"]
    base_name = str(assistant_data.get("name", "Imported Assistant")).strip()

    # Check for duplicate name — append suffix if needed
    existing_stmt = select(PromptSystem).where(
        PromptSystem.owner_id == owner_id,
        PromptSystem.name == base_name,
        PromptSystem.archived.is_(False),
    )
    existing_result = await db.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        import_name = f"{base_name} (Imported)"
        # Check again with new name
        dup_stmt = select(PromptSystem).where(
            PromptSystem.owner_id == owner_id,
            PromptSystem.name == import_name,
            PromptSystem.archived.is_(False),
        )
        dup_result = await db.execute(dup_stmt)
        if dup_result.scalar_one_or_none():
            import_name = f"{base_name} (Imported Copy)"
    else:
        import_name = base_name

    new_system = PromptSystem(
        name=import_name,
        description=assistant_data.get("description"),
        instructions=assistant_data.get("instructions"),
        variables=copy.deepcopy(data.get("variables", [])),
        examples=copy.deepcopy(data.get("examples", [])),
        output_format=copy.deepcopy(data.get("output_format", {})),
        modules=copy.deepcopy(data.get("modules_config", [])),
        owner_id=owner_id,
        version=1,
        archived=False,
        visibility="private",
        share_token=None,
        ai_provider=assistant_data.get("ai_provider") or assistant_data.get("provider"),
        model=assistant_data.get("model"),
    )
    db.add(new_system)
    await db.flush()

    # Import sub-assistants as new PromptModule records owned by this user
    sub_assistants = data.get("sub_assistants", [])
    for sa_data in sub_assistants:
        if not isinstance(sa_data, dict):
            continue
        new_module = PromptModule(
            owner_id=owner_id,
            name=str(sa_data.get("name", "Imported Sub-Assistant")).strip(),
            description=sa_data.get("description"),
            instructions=sa_data.get("instructions"),
            variables=copy.deepcopy(sa_data.get("variables", [])),
            input_context=copy.deepcopy(sa_data.get("input_context", [])),
            output_contract=copy.deepcopy(sa_data.get("output_contract")),
            examples=copy.deepcopy(sa_data.get("examples", [])),
        )
        db.add(new_module)
        await db.flush()

        new_ref = ModuleReference(
            prompt_system_id=new_system.id,
            module_id=new_module.id,
            input_mapping=copy.deepcopy(sa_data.get("input_mapping", {})),
            output_mapping=copy.deepcopy(sa_data.get("output_mapping", {})),
            enabled=bool(sa_data.get("enabled", True)),
        )
        db.add(new_ref)

    await db.commit()
    await db.refresh(new_system)
    return new_system
