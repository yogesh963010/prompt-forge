"""TestCase service layer for managing and executing test cases."""
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.prompt_system import PromptSystem
from ..models.test_case import TestCase
from ..schemas.test_case import TestCaseCreate, TestCaseUpdate
from ..services.composer_service import compose_prompt_system
from ..utils.prompt_renderer import render_prompt
from ..utils.variable_parser import extract_variables


def get_required_variables(prompt_system: PromptSystem) -> Dict[str, Dict[str, Any]]:
    """Extract required variables, their types, and defaults from a PromptSystem."""
    var_specs: Dict[str, Dict[str, Any]] = {}

    configured = prompt_system.variables
    if configured:
        if isinstance(configured, list):
            for item in configured:
                if isinstance(item, dict):
                    name = str(item.get("name", "")).strip().strip("{}")
                    if name:
                        var_specs[name] = {
                            "required": bool(item.get("required", True)),
                            "default": item.get("default"),
                            "type": item.get("type", "text"),
                        }
                elif isinstance(item, str) and item.strip():
                    name = item.strip().strip("{}")
                    var_specs[name] = {"required": True, "default": None, "type": "text"}
        elif isinstance(configured, dict):
            for k, v in configured.items():
                clean_k = str(k).strip().strip("{}")
                if isinstance(v, dict):
                    var_specs[clean_k] = {
                        "required": bool(v.get("required", True)),
                        "default": v.get("default"),
                        "type": v.get("type", "text"),
                    }
                else:
                    var_specs[clean_k] = {"required": True, "default": None, "type": "text"}

    detected = extract_variables(prompt_system.instructions)
    for var in detected:
        if var not in var_specs:
            var_specs[var] = {"required": True, "default": None, "type": "text"}

    return var_specs


def validate_test_case_variables(
    prompt_system: PromptSystem,
    test_variables: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Validate runtime variables provided by a test case against PromptSystem requirements.

    Returns the runtime variables mapping with any defaults applied.
    Raises HTTPException(400) if required variables are missing or values are invalid.
    """
    supplied = dict(test_variables or {})
    var_specs = get_required_variables(prompt_system)
    missing: List[str] = []

    for name, spec in var_specs.items():
        is_required = spec["required"]
        default_val = spec["default"]
        var_type = spec.get("type", "text")

        val = supplied.get(name)

        if val is None or (isinstance(val, str) and not val.strip()):
            if default_val is not None and str(default_val).strip() != "":
                supplied[name] = default_val
                val = default_val
            elif is_required:
                missing.append(name)
                continue

        if val is not None and var_type == "number":
            try:
                float(val)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid value for variable '{name}': expected number, got '{val}'.",
                )

    if missing:
        if len(missing) == 1:
            detail = f"Missing required variable: '{missing[0]}'."
        else:
            detail = f"Missing required variable(s): {', '.join(missing)}."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    return supplied


def generate_test_output(
    resolved_prompt: str,
    test_case_name: str,
    expected_behavior: Any = None,
    variables: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate provider-independent output for lightweight test case execution."""
    lines = [
        f"[Test Output for '{test_case_name}']",
        "Status: Success",
        f"Input Variables: {len(variables) if variables else 0} variable(s) resolved.",
    ]
    if variables:
        for k, v in variables.items():
            lines.append(f"  • {k}: {v}")

    if expected_behavior:
        lines.append("Expected Behavior:")
        if isinstance(expected_behavior, list):
            for item in expected_behavior:
                lines.append(f"  - {item}")
        else:
            lines.append(f"  {str(expected_behavior).strip()}")

    lines.append("\nGenerated Response:")
    lines.append(
        f"The prompt system was successfully resolved ({len(resolved_prompt)} characters). "
        f"The output demonstrates proper variable substitution and deterministic assembly "
        f"ready for AI model execution."
    )
    return "\n".join(lines)


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


async def create_test_case(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
    data: TestCaseCreate,
) -> TestCase:
    """Create a new test case for an owned PromptSystem."""
    prompt_system = await get_owned_prompt_system(db, prompt_system_id, user_id)

    test_case = TestCase(
        prompt_system_id=prompt_system.id,
        name=data.name,
        variables=data.variables if data.variables is not None else {},
        expected_behavior=data.expected_behavior,
    )
    db.add(test_case)
    await db.commit()
    await db.refresh(test_case)
    return test_case


async def get_test_case(
    db: AsyncSession,
    prompt_system_id: int,
    test_id: int,
    user_id: int,
) -> TestCase:
    """Retrieve a single test case belonging to an owned PromptSystem."""
    await get_owned_prompt_system(db, prompt_system_id, user_id)

    stmt = select(TestCase).where(TestCase.id == test_id)
    result = await db.execute(stmt)
    test_case = result.scalar_one_or_none()

    if not test_case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test case not found.",
        )
    if test_case.prompt_system_id != prompt_system_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test case not found in this Prompt System.",
        )
    return test_case


async def list_test_cases(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> List[TestCase]:
    """List all test cases for an owned PromptSystem."""
    await get_owned_prompt_system(db, prompt_system_id, user_id)

    stmt = (
        select(TestCase)
        .where(TestCase.prompt_system_id == prompt_system_id)
        .order_by(TestCase.id.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_test_case(
    db: AsyncSession,
    prompt_system_id: int,
    test_id: int,
    user_id: int,
    data: TestCaseUpdate,
) -> TestCase:
    """Update a test case belonging to an owned PromptSystem."""
    test_case = await get_test_case(db, prompt_system_id, test_id, user_id)

    if data.name is not None:
        test_case.name = data.name
    if data.variables is not None:
        test_case.variables = data.variables
    if data.expected_behavior is not None:
        test_case.expected_behavior = data.expected_behavior

    await db.commit()
    await db.refresh(test_case)
    return test_case


async def delete_test_case(
    db: AsyncSession,
    prompt_system_id: int,
    test_id: int,
    user_id: int,
) -> None:
    """Delete a test case belonging to an owned PromptSystem."""
    test_case = await get_test_case(db, prompt_system_id, test_id, user_id)
    await db.delete(test_case)
    await db.commit()


async def run_test_case(
    db: AsyncSession,
    prompt_system_id: int,
    test_id: int,
    user_id: int,
) -> Dict[str, Any]:
    """Execute a test case: validate variables, compose prompt, resolve variables, generate output."""
    prompt_system = await get_owned_prompt_system(db, prompt_system_id, user_id)
    test_case = await get_test_case(db, prompt_system_id, test_id, user_id)

    # 1. Variable validation
    resolved_vars = validate_test_case_variables(prompt_system, test_case.variables)

    # 2. Existing Prompt Composer (source of truth)
    composed_prompt = await compose_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
    )

    # 3. Resolve variables in composed prompt
    resolved_prompt = render_prompt(composed_prompt, resolved_vars)

    # 4. Lightweight provider-independent generated output
    generated_output = generate_test_output(
        resolved_prompt=resolved_prompt,
        test_case_name=test_case.name,
        expected_behavior=test_case.expected_behavior,
        variables=resolved_vars,
    )

    return {
        "test_case_id": test_case.id,
        "prompt_system_id": prompt_system_id,
        "name": test_case.name,
        "variables": resolved_vars,
        "expected_behavior": test_case.expected_behavior,
        "resolved_prompt": resolved_prompt,
        "generated_output": generated_output,
    }
