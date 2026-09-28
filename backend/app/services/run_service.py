"""Prompt Run service layer for executing prompt systems with runtime variables.

Follows the PromptForge architecture:
- Reuses the existing Prompt Composer as the single source of truth for prompt assembly.
- Validates runtime variables against the configured VariableSchema (types, defaults, required).
- Resolves only configured runtime variables, preserving unconfigured placeholders (e.g. module boundaries).
- Never persists runtime values or mutates the saved Prompt System in the database.
"""
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..schemas.prompt_run import PromptRunRequest, PromptRunResponse
from ..services.composer_service import compose_prompt_system
from ..utils.variable_parser import extract_variables


def extract_configured_variable_specs(prompt_system: PromptSystem) -> Dict[str, Dict[str, Any]]:
    """Extract configured variables, their types, defaults, options, and required flags.

    Respects the existing PromptForge variable configuration and schema.
    """
    var_specs: Dict[str, Dict[str, Any]] = {}

    configured = prompt_system.variables
    if configured:
        if isinstance(configured, list):
            for item in configured:
                if isinstance(item, dict):
                    name = str(item.get("name", "")).strip().strip("{}")
                    if name:
                        var_specs[name] = {
                            "name": name,
                            "label": item.get("label") or name,
                            "type": str(item.get("type", "text")).lower(),
                            "required": bool(item.get("required", True)),
                            "default": item.get("default"),
                            "description": item.get("description"),
                            "options": item.get("options"),
                        }
                elif isinstance(item, str) and item.strip():
                    name = item.strip().strip("{}")
                    var_specs[name] = {
                        "name": name,
                        "label": name,
                        "type": "text",
                        "required": True,
                        "default": None,
                        "description": None,
                        "options": None,
                    }
        elif isinstance(configured, dict):
            # Check if wrapped under a 'variables' key
            if "variables" in configured and isinstance(configured["variables"], (list, dict)):
                raw_vars = configured["variables"]
                items = raw_vars if isinstance(raw_vars, list) else list(raw_vars.values())
                for item in items:
                    if isinstance(item, dict):
                        name = str(item.get("name", "")).strip().strip("{}")
                        if name:
                            var_specs[name] = {
                                "name": name,
                                "label": item.get("label") or name,
                                "type": str(item.get("type", "text")).lower(),
                                "required": bool(item.get("required", True)),
                                "default": item.get("default"),
                                "description": item.get("description"),
                                "options": item.get("options"),
                            }
            else:
                for k, v in configured.items():
                    clean_k = str(k).strip().strip("{}")
                    if isinstance(v, dict):
                        var_specs[clean_k] = {
                            "name": clean_k,
                            "label": v.get("label") or clean_k,
                            "type": str(v.get("type", "text")).lower(),
                            "required": bool(v.get("required", True)),
                            "default": v.get("default"),
                            "description": v.get("description"),
                            "options": v.get("options"),
                        }
                    else:
                        var_specs[clean_k] = {
                            "name": clean_k,
                            "label": clean_k,
                            "type": "text",
                            "required": True,
                            "default": None,
                            "description": None,
                            "options": None,
                        }

    # If prompt_system.variables was empty/None, fall back to detecting from instructions
    if not var_specs and prompt_system.instructions:
        detected = extract_variables(prompt_system.instructions)
        for var in detected:
            if var not in var_specs:
                var_specs[var] = {
                    "name": var,
                    "label": var,
                    "type": "text",
                    "required": True,
                    "default": None,
                    "description": None,
                    "options": None,
                }

    return var_specs


def validate_runtime_variables(
    prompt_system: PromptSystem,
    runtime_variables: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Validate runtime variables against configured variable specifications.

    - Pre-fills defaults when runtime value is missing or empty.
    - Validates required fields; raises HTTP 400 if missing.
    - Validates number types; raises HTTP 400 if not convertible to number.
    - Validates select choices; raises HTTP 400 if not in configured options.
    - Returns sanitized dictionary of runtime values for configured variables.
    """
    supplied = dict(runtime_variables or {})
    var_specs = extract_configured_variable_specs(prompt_system)
    validated: Dict[str, Any] = {}
    missing: List[str] = []

    for name, spec in var_specs.items():
        is_required = spec["required"]
        default_val = spec["default"]
        var_type = spec["type"]
        options = spec.get("options")
        display_label = spec.get("label") or name

        val = supplied.get(name)

        # Handle missing or empty values
        if val is None or (isinstance(val, str) and not val.strip()):
            if default_val is not None and str(default_val).strip() != "":
                val = default_val
            elif is_required:
                missing.append(name)
                continue
            else:
                val = ""

        # Validate types when a value is provided
        if val is not None and val != "":
            if var_type == "number":
                try:
                    # Accepts ints or floats, converting to number
                    if isinstance(val, (int, float)):
                        val = val
                    else:
                        num_str = str(val).strip()
                        val = float(num_str) if "." in num_str else int(num_str)
                except (ValueError, TypeError):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid value for variable '{name}': expected number, got '{val}'.",
                    )
            elif var_type == "select":
                if options and isinstance(options, list) and len(options) > 0:
                    str_options = [str(opt).strip() for opt in options]
                    if str(val).strip() not in str_options:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid value for variable '{name}': expected one of {str_options}, got '{val}'.",
                        )

        validated[name] = val

    if missing:
        if len(missing) == 1:
            detail = f"Missing required variable: '{missing[0]}'. Variable '{missing[0]}' is required."
        else:
            detail = f"Missing required variable(s): {', '.join(missing)}."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    return validated


def resolve_runtime_variables(
    composed_prompt: str,
    configured_specs: Dict[str, Dict[str, Any]],
    validated_variables: Dict[str, Any],
) -> str:
    """Substitute runtime values strictly for configured variables in the composed prompt.

    IMPORTANT: Only resolves variables configured on the Prompt System.
    Preserves unconfigured placeholders such as module outputs {research_output},
    {critic_output}, etc.
    """
    if not composed_prompt:
        return ""

    resolved = composed_prompt
    for key in configured_specs.keys():
        if key in validated_variables:
            val = validated_variables[key]
            if val is not None:
                placeholder = f"{{{key}}}"
                resolved = resolved.replace(placeholder, str(val))

    return resolved


async def get_owned_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> PromptSystem:
    """Fetch and verify ownership of a PromptSystem for prompt runs."""
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


async def run_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
    request: PromptRunRequest,
) -> PromptRunResponse:
    """Execute a Prompt Run workflow:

    1. Verify Prompt System exists and ownership.
    2. Extract configured variable specs and validate runtime variables.
    3. Call the existing Prompt Composer as the single source of truth.
    4. Substitute runtime variable placeholders into the composed prompt.
    5. Return resolved prompt without mutating Prompt System in database.
    """
    # 1. Verify existence & ownership
    prompt_system = await get_owned_prompt_system(db, prompt_system_id, user_id)

    # 2. Extract configured specs & validate runtime variables
    var_specs = extract_configured_variable_specs(prompt_system)
    validated_vars = validate_runtime_variables(prompt_system, request.variables)

    # 3. Call existing Composer
    composed_prompt = await compose_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
    )

    # 4. Resolve runtime variables
    resolved_prompt = resolve_runtime_variables(
        composed_prompt=composed_prompt,
        configured_specs=var_specs,
        validated_variables=validated_vars,
    )

    return PromptRunResponse(
        prompt_system_id=prompt_system_id,
        variables=validated_vars,
        resolved_prompt=resolved_prompt,
    )
