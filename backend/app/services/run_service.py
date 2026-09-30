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
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..models.module_reference import ModuleReference
from ..models.prompt_module import PromptModule
from ..schemas.prompt_run import PromptRunRequest, PromptRunResponse
from ..services.composer_service import compose_prompt_system
from ..services.history_service import save_prompt_run_history
from ..utils.variable_parser import extract_variables


def extract_variable_specs_from_definition(
    configured: Any,
    fallback_instructions: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Extract configured variables, their types, defaults, options, and required flags.

    Reused across Prompt Systems and Prompt Modules.
    """
    var_specs: Dict[str, Dict[str, Any]] = {}

    if configured:
        if isinstance(configured, list):
            for item in configured:
                if isinstance(item, dict):
                    name = str(item.get("name", "")).strip().strip("{}")
                    if name:
                        raw_type = str(item.get("type", "text")).lower().strip()
                        if raw_type in ("string", "str"):
                            raw_type = "text"
                        elif raw_type in ("int",):
                            raw_type = "integer"
                        elif raw_type in ("bool",):
                            raw_type = "boolean"
                        elif raw_type in ("num", "float"):
                            raw_type = "number"

                        var_specs[name] = {
                            "name": name,
                            "label": item.get("label") or name,
                            "type": raw_type,
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
            if "variables" in configured and isinstance(configured["variables"], (list, dict)):
                raw_vars = configured["variables"]
                items = raw_vars if isinstance(raw_vars, list) else list(raw_vars.values())
                for item in items:
                    if isinstance(item, dict):
                        name = str(item.get("name", "")).strip().strip("{}")
                        if name:
                            raw_type = str(item.get("type", "text")).lower().strip()
                            if raw_type in ("string", "str"):
                                raw_type = "text"
                            elif raw_type in ("int",):
                                raw_type = "integer"
                            elif raw_type in ("bool",):
                                raw_type = "boolean"
                            elif raw_type in ("num", "float"):
                                raw_type = "number"

                            var_specs[name] = {
                                "name": name,
                                "label": item.get("label") or name,
                                "type": raw_type,
                                "required": bool(item.get("required", True)),
                                "default": item.get("default"),
                                "description": item.get("description"),
                                "options": item.get("options"),
                            }
            else:
                for k, v in configured.items():
                    clean_k = str(k).strip().strip("{}")
                    if isinstance(v, dict):
                        raw_type = str(v.get("type", "text")).lower().strip()
                        if raw_type in ("string", "str"):
                            raw_type = "text"
                        elif raw_type in ("int",):
                            raw_type = "integer"
                        elif raw_type in ("bool",):
                            raw_type = "boolean"
                        elif raw_type in ("num", "float"):
                            raw_type = "number"

                        var_specs[clean_k] = {
                            "name": clean_k,
                            "label": v.get("label") or clean_k,
                            "type": raw_type,
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

    # If variables was empty/None, fall back to detecting from instructions
    if not var_specs and fallback_instructions:
        detected = extract_variables(fallback_instructions)
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


def extract_configured_variable_specs(prompt_system: PromptSystem) -> Dict[str, Dict[str, Any]]:
    """Extract configured variables from a PromptSystem."""
    return extract_variable_specs_from_definition(
        configured=prompt_system.variables,
        fallback_instructions=prompt_system.instructions,
    )


def validate_variable_values(
    var_specs: Dict[str, Dict[str, Any]],
    runtime_values: Optional[Dict[str, Any]],
    context_name: str = "variable",
) -> Dict[str, Any]:
    """Validate runtime variables against variable specifications.

    - Pre-fills defaults when runtime value is missing or empty.
    - Validates required fields; raises HTTP 400 if missing.
    - Validates integer, number, boolean, select types.
    - Returns sanitized dictionary of runtime values.
    """
    supplied = dict(runtime_values or {})
    validated: Dict[str, Any] = {}
    missing: List[str] = []

    for name, spec in var_specs.items():
        is_required = spec["required"]
        default_val = spec["default"]
        var_type = spec["type"]
        options = spec.get("options")

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
            if var_type == "integer":
                # In Python, bool is a subclass of int (isinstance(True, int) == True).
                # Explicitly reject boolean values for integer type.
                if isinstance(val, bool):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid value for {context_name} '{name}': expected integer, got '{val}'.",
                    )
                elif isinstance(val, int):
                    val = val
                elif isinstance(val, float):
                    if val.is_integer():
                        val = int(val)
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid value for {context_name} '{name}': expected integer, got '{val}'.",
                        )
                else:
                    str_val = str(val).strip()
                    try:
                        if "." in str_val:
                            raise ValueError()
                        val = int(str_val)
                    except (ValueError, TypeError):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid value for {context_name} '{name}': expected integer, got '{val}'.",
                        )
            elif var_type == "number":
                if isinstance(val, bool):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid value for {context_name} '{name}': expected number, got '{val}'.",
                    )
                elif isinstance(val, (int, float)):
                    val = val
                else:
                    num_str = str(val).strip()
                    try:
                        val = float(num_str) if "." in num_str else int(num_str)
                    except (ValueError, TypeError):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid value for {context_name} '{name}': expected number, got '{val}'.",
                        )
            elif var_type == "boolean":
                if isinstance(val, bool):
                    val = val
                elif isinstance(val, str):
                    low = val.strip().lower()
                    if low in ("true", "1", "yes", "t"):
                        val = True
                    elif low in ("false", "0", "no", "f"):
                        val = False
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid value for {context_name} '{name}': expected boolean, got '{val}'.",
                        )
                elif isinstance(val, int) and val in (0, 1):
                    val = bool(val)
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid value for {context_name} '{name}': expected boolean, got '{val}'.",
                    )
            elif var_type == "select":
                if options and isinstance(options, list) and len(options) > 0:
                    str_options = [str(opt).strip() for opt in options]
                    if str(val).strip() not in str_options:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid value for {context_name} '{name}': expected one of {str_options}, got '{val}'.",
                        )

        validated[name] = val

    if missing:
        if len(missing) == 1:
            detail = f"Missing required {context_name}: '{missing[0]}'. {context_name.capitalize()} '{missing[0]}' is required."
        else:
            detail = f"Missing required {context_name}(s): {', '.join(missing)}."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    return validated


def validate_runtime_variables(
    prompt_system: PromptSystem,
    runtime_variables: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Validate runtime variables against configured variable specifications."""
    var_specs = extract_configured_variable_specs(prompt_system)
    return validate_variable_values(var_specs, runtime_variables, context_name="variable")


def resolve_runtime_variables(
    composed_prompt: str,
    configured_specs: Dict[str, Dict[str, Any]],
    validated_variables: Dict[str, Any],
    module_specs: Optional[Dict[str, Dict[str, Any]]] = None,
    validated_module_variables: Optional[Dict[str, Any]] = None,
    raw_runtime_variables: Optional[Dict[str, Any]] = None,
    user_input: Optional[str] = None,
    previous_module_output: Optional[str] = None,
) -> str:
    """Substitute runtime values strictly for configured variables in the composed prompt.

    Supports:
    - Module variables: {key} and {module.key}
    - Parent variables: {key} and {parent.key}
    - User input: {user_input}
    - Previous module output: {previous_module_output} and any remaining output placeholders
    """
    if not composed_prompt:
        return ""

    resolved = composed_prompt

    # 1. Resolve Module Variables
    if validated_module_variables:
        for key, val in validated_module_variables.items():
            if val is not None:
                resolved = resolved.replace(f"{{module.{key}}}", str(val))
                resolved = resolved.replace(f"{{{key}}}", str(val))

    # 2. Resolve Parent Variables
    if validated_variables:
        for key, val in validated_variables.items():
            if val is not None:
                resolved = resolved.replace(f"{{parent.{key}}}", str(val))
                resolved = resolved.replace(f"{{{key}}}", str(val))

    # 3. Resolve User Input
    user_val = user_input
    if user_val is None and raw_runtime_variables and "user_input" in raw_runtime_variables:
        user_val = raw_runtime_variables["user_input"]
    elif user_val is None and "user_input" in validated_variables:
        user_val = validated_variables["user_input"]

    if user_val is not None and "{user_input}" in resolved:
        resolved = resolved.replace("{user_input}", str(user_val))

    # 4. Resolve Previous Module Output
    prev_out_val = previous_module_output
    if prev_out_val is None and raw_runtime_variables and "previous_module_output" in raw_runtime_variables:
        prev_out_val = raw_runtime_variables["previous_module_output"]

    if prev_out_val is not None:
        if "{previous_module_output}" in resolved:
            resolved = resolved.replace("{previous_module_output}", str(prev_out_val))

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
    2. If module_id is specified:
       - Verify module exists, is attached to Prompt System, and ownership.
       - Extract module variable specs & validate runtime module variables.
       - If module enabled parent_variables, validate parent variables.
       - Call Composer with selected_module_id (executing ONLY the selected module).
       - Substitute module and parent runtime variables.
    3. If running entire Prompt System:
       - Validate prompt system variables.
       - Call Composer for full system.
       - Substitute runtime variables.
    4. Return PromptRunResponse without mutating database.
    """
    prompt_system = await get_owned_prompt_system(db, prompt_system_id, user_id)

    if request.module_id is not None:
        # 1. Fetch ModuleReference eagerly loading prompt_module
        stmt_ref = (
            select(ModuleReference)
            .where(
                ModuleReference.prompt_system_id == prompt_system_id,
                ModuleReference.enabled.is_(True),
                (ModuleReference.module_id == request.module_id) | (ModuleReference.id == request.module_id),
            )
            .options(selectinload(ModuleReference.prompt_module))
        )
        res_ref = await db.execute(stmt_ref)
        ref = res_ref.scalar_one_or_none()

        if not ref or not ref.prompt_module:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Selected module ID {request.module_id} is not enabled or not attached to this Prompt System.",
            )

        selected_module = ref.prompt_module
        if selected_module.owner_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have access to selected module ID {request.module_id}.",
            )

        # 2. Extract and validate module variables
        module_specs = extract_variable_specs_from_definition(
            configured=selected_module.variables,
            fallback_instructions=selected_module.instructions,
        )
        validated_module_vars = validate_variable_values(
            var_specs=module_specs,
            runtime_values=request.module_variables,
            context_name="module variable",
        )

        # 3. Check selected contexts for this module
        selected_contexts = set()
        if isinstance(selected_module.input_context, list):
            for item in selected_module.input_context:
                if isinstance(item, str):
                    selected_contexts.add(item.strip())
                elif isinstance(item, dict):
                    name = item.get("name") or item.get("key")
                    if name:
                        selected_contexts.add(str(name).strip())
        elif isinstance(selected_module.input_context, dict):
            selected_contexts.update(k.strip() for k in selected_module.input_context.keys())
        elif isinstance(selected_module.input_context, str):
            selected_contexts.add(selected_module.input_context.strip())

        if isinstance(ref.input_mapping, dict):
            for k, v in ref.input_mapping.items():
                if k in {"parent_variables", "parent_instructions", "previous_module_output", "user_input"}:
                    selected_contexts.add(k)
                if isinstance(v, str) and v.strip("{}") in {"parent_variables", "parent_instructions", "previous_module_output", "user_input"}:
                    selected_contexts.add(v.strip("{}"))

        # 4. Only validate Parent Variables if the module selected parent_variables context
        if "parent_variables" in selected_contexts:
            parent_specs = extract_configured_variable_specs(prompt_system)
            validated_parent_vars = validate_variable_values(
                var_specs=parent_specs,
                runtime_values=request.variables,
                context_name="variable",
            )
        else:
            parent_specs = {}
            validated_parent_vars = {}

        # 5. Call Composer for ONLY the selected module
        composed_prompt = await compose_prompt_system(
            db=db,
            prompt_system_id=prompt_system_id,
            user_id=user_id,
            selected_module_id=selected_module.id,
            runtime_previous_output=request.previous_module_output,
            runtime_user_input=request.user_input,
        )

        # 6. Resolve runtime variables
        resolved_prompt = resolve_runtime_variables(
            composed_prompt=composed_prompt,
            configured_specs=parent_specs,
            validated_variables=validated_parent_vars,
            module_specs=module_specs,
            validated_module_variables=validated_module_vars,
            raw_runtime_variables=request.variables,
            user_input=request.user_input,
            previous_module_output=request.previous_module_output,
        )

        # 7. Save History Snapshot
        combined_runtime_vars: Dict[str, Any] = {}
        if isinstance(validated_parent_vars, dict):
            combined_runtime_vars.update(validated_parent_vars)
        if isinstance(validated_module_vars, dict):
            combined_runtime_vars.update(validated_module_vars)
        if isinstance(request.variables, dict):
            for k, v in request.variables.items():
                if k not in combined_runtime_vars:
                    combined_runtime_vars[k] = v
        if isinstance(request.module_variables, dict):
            for k, v in request.module_variables.items():
                if k not in combined_runtime_vars:
                    combined_runtime_vars[k] = v

        await save_prompt_run_history(
            db=db,
            user_id=user_id,
            prompt_system_id=prompt_system.id,
            prompt_system_name=prompt_system.name,
            final_prompt=resolved_prompt,
            module_id=selected_module.id,
            module_name=selected_module.name,
            runtime_variables=combined_runtime_vars,
        )

        return PromptRunResponse(
            prompt_system_id=prompt_system_id,
            module_id=selected_module.id,
            variables=validated_parent_vars,
            module_variables=validated_module_vars,
            user_input=request.user_input,
            previous_module_output=request.previous_module_output,
            resolved_prompt=resolved_prompt,
        )

    # Entire Prompt System Run (no specific module selected)
    parent_specs = extract_configured_variable_specs(prompt_system)
    validated_parent_vars = validate_runtime_variables(prompt_system, request.variables)

    composed_prompt = await compose_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
        runtime_previous_output=request.previous_module_output,
        runtime_user_input=request.user_input,
    )

    resolved_prompt = resolve_runtime_variables(
        composed_prompt=composed_prompt,
        configured_specs=parent_specs,
        validated_variables=validated_parent_vars,
        raw_runtime_variables=request.variables,
        user_input=request.user_input,
        previous_module_output=request.previous_module_output,
    )

    # Save History Snapshot
    runtime_vars: Dict[str, Any] = {}
    if isinstance(validated_parent_vars, dict):
        runtime_vars.update(validated_parent_vars)
    if isinstance(request.variables, dict):
        for k, v in request.variables.items():
            if k not in runtime_vars:
                runtime_vars[k] = v

    await save_prompt_run_history(
        db=db,
        user_id=user_id,
        prompt_system_id=prompt_system.id,
        prompt_system_name=prompt_system.name,
        final_prompt=resolved_prompt,
        module_id=None,
        module_name=None,
        runtime_variables=runtime_vars,
    )

    return PromptRunResponse(
        prompt_system_id=prompt_system_id,
        variables=validated_parent_vars,
        resolved_prompt=resolved_prompt,
    )
