"""Prompt Composer & Preview service layer for assembling and previewing Prompt Systems deterministically."""
import json
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.module_reference import ModuleReference
from ..models.prompt_system import PromptSystem


def format_variables_section(variables: Any) -> Optional[str]:
    """Format PromptSystem variables preserving {variable} placeholders."""
    if not variables:
        return None

    lines: List[str] = []
    if isinstance(variables, list):
        for item in variables:
            if isinstance(item, dict):
                name = str(item.get("name", "")).strip().strip("{}")
                label = item.get("label") or name
                if name:
                    lines.append(f"{label}: {{{name}}}")
            elif isinstance(item, str) and item.strip():
                clean = item.strip().strip("{}")
                lines.append(f"{clean}: {{{clean}}}")
    elif isinstance(variables, dict):
        for key, val in variables.items():
            clean_key = str(key).strip().strip("{}")
            if isinstance(val, dict):
                label = val.get("label") or clean_key
                lines.append(f"{label}: {{{clean_key}}}")
            elif isinstance(val, str) and "{" in val:
                lines.append(f"{key}: {val.strip()}")
            else:
                lines.append(f"{clean_key}: {{{clean_key}}}")

    if lines:
        return "\n".join(lines)
    return None


def format_examples_section(examples: Any) -> Optional[str]:
    """Format PromptSystem examples into a deterministic, readable block."""
    if not examples:
        return None

    blocks: List[str] = []

    def format_single_example(ex: Any, index: Optional[int] = None) -> Optional[str]:
        if isinstance(ex, dict):
            parts: List[str] = []
            title = ex.get("title")
            inp = ex.get("input") if ex.get("input") is not None else ex.get("input_context", ex.get("prompt"))
            out = ex.get("expected") if ex.get("expected") is not None else ex.get("output", ex.get("response"))

            if title:
                parts.append(f"Example: {title}")
            elif index is not None and not (inp or out):
                parts.append(f"Example {index}:")

            if inp is not None:
                parts.append(f"Input:\n{str(inp).strip()}")
            if out is not None:
                parts.append(f"Expected:\n{str(out).strip()}")

            if inp is None and out is None:
                for k, v in ex.items():
                    if k != "title":
                        parts.append(f"{k}:\n{str(v).strip()}")

            return "\n\n".join(parts) if parts else None
        elif isinstance(ex, str) and ex.strip():
            return ex.strip()
        elif ex is not None:
            return str(ex).strip()
        return None

    if isinstance(examples, list):
        for idx, ex in enumerate(examples, start=1):
            formatted = format_single_example(ex, idx if len(examples) > 1 else None)
            if formatted:
                blocks.append(formatted)
    elif isinstance(examples, dict):
        inp = examples.get("input") or examples.get("prompt")
        out = examples.get("expected") or examples.get("output") or examples.get("response")
        if inp is not None or out is not None:
            formatted = format_single_example(examples)
            if formatted:
                blocks.append(formatted)
        else:
            for k, v in examples.items():
                if isinstance(v, (dict, str)):
                    formatted = format_single_example(v)
                    if formatted:
                        blocks.append(f"Example: {k}\n\n{formatted}")
                else:
                    blocks.append(f"{k}:\n{str(v).strip()}")
    elif isinstance(examples, str) and examples.strip():
        blocks.append(examples.strip())

    if blocks:
        return "\n\n".join(blocks)
    return None


def format_output_format_section(output_format: Any) -> Optional[str]:
    """Format output_format (string, dict, or list) into a readable representation."""
    if output_format is None:
        return None

    if isinstance(output_format, str):
        trimmed = output_format.strip()
        return trimmed if trimmed else None
    elif isinstance(output_format, list):
        if not output_format:
            return None
        lines = [f"- {str(item).strip()}" for item in output_format]
        return "\n".join(lines)
    elif isinstance(output_format, dict):
        if not output_format:
            return None
        return json.dumps(output_format, indent=2)

    return str(output_format).strip() or None


def format_module_input_context(input_mapping: Any, module_input_context: Any) -> Optional[str]:
    """Format input context for a module respecting configured boundaries."""
    lines: List[str] = []

    if isinstance(input_mapping, dict) and input_mapping:
        for param, source in input_mapping.items():
            clean_source = str(source).strip().strip("{}")
            clean_param = str(param).strip()
            lines.append(f"{clean_param}: {{{clean_source}}}")
    elif module_input_context:
        if isinstance(module_input_context, list):
            for item in module_input_context:
                if isinstance(item, str) and item.strip():
                    clean = item.strip().strip("{}")
                    lines.append(f"{clean}: {{{clean}}}")
                elif isinstance(item, dict):
                    name = item.get("name") or str(item)
                    clean = str(name).strip().strip("{}")
                    lines.append(f"{clean}: {{{clean}}}")
        elif isinstance(module_input_context, dict):
            for k in module_input_context.keys():
                clean_k = str(k).strip().strip("{}")
                lines.append(f"{clean_k}: {{{clean_k}}}")
        elif isinstance(module_input_context, str) and module_input_context.strip():
            clean = module_input_context.strip().strip("{}")
            lines.append(f"{clean}: {{{clean}}}")

    if lines:
        return "\n".join(lines)
    return None


def format_module_output_mapping(output_mapping: Any) -> Optional[str]:
    """Format module output mapping as deterministic placeholders."""
    if not isinstance(output_mapping, dict) or not output_mapping:
        return None

    lines: List[str] = []
    for out_key, out_val in output_mapping.items():
        clean_val = str(out_val).strip().strip("{}")
        clean_key = str(out_key).strip()
        if not clean_key or clean_key == clean_val:
            lines.append(f"{{{clean_val}}}")
        else:
            lines.append(f"{clean_key}: {{{clean_val}}}")

    if lines:
        return "\n".join(lines)
    return None


async def assemble_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> Tuple[str, Dict[str, Any]]:
    """Assemble a PromptSystem returning both raw composed prompt text and structured data.

    Single source of truth for both compose and preview flows.
    """
    # 1. Fetch PromptSystem
    stmt = select(PromptSystem).where(PromptSystem.id == prompt_system_id)
    result = await db.execute(stmt)
    prompt_system = result.scalar_one_or_none()

    if not prompt_system:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt System not found.",
        )

    # 2. Ownership verification
    if prompt_system.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this Prompt System.",
        )

    sections: List[str] = []
    structured_modules: List[Dict[str, Any]] = []

    # 3. Core Instructions
    instructions_text = None
    if prompt_system.instructions and prompt_system.instructions.strip():
        instructions_text = prompt_system.instructions.strip()
        sections.append(f"SYSTEM INSTRUCTIONS\n\n{instructions_text}")

    # 4. System Variables / Context
    variables_text = format_variables_section(prompt_system.variables)
    if variables_text:
        sections.append(f"VARIABLES / CONTEXT\n\n{variables_text}")

    # 5. System Examples
    examples_text = format_examples_section(prompt_system.examples)
    if examples_text:
        sections.append(f"EXAMPLES\n\n{examples_text}")

    # 6. Enabled Module References (ordered by reference ID)
    stmt_modules = (
        select(ModuleReference)
        .where(
            ModuleReference.prompt_system_id == prompt_system_id,
            ModuleReference.enabled.is_(True),
        )
        .options(selectinload(ModuleReference.prompt_module))
        .order_by(ModuleReference.id.asc())
    )
    result_modules = await db.execute(stmt_modules)
    references = list(result_modules.scalars().all())

    for ref in references:
        module = ref.prompt_module
        if not module:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Referenced module ID {ref.module_id} not found.",
            )

        # Enforce Branch 11 ownership rules
        if module.owner_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have access to referenced module ID {ref.module_id}.",
            )

        module_parts: List[str] = [f"MODULE: {module.name}"]

        if module.description and module.description.strip():
            module_parts.append(f"DESCRIPTION:\n{module.description.strip()}")

        if module.instructions and module.instructions.strip():
            module_parts.append(f"INSTRUCTIONS:\n{module.instructions.strip()}")

        # Input context respecting boundary configuration
        input_context_text = format_module_input_context(ref.input_mapping, module.input_context)
        if input_context_text:
            module_parts.append(f"INPUT CONTEXT:\n{input_context_text}")

        # Output contract
        if module.output_contract:
            if isinstance(module.output_contract, str) and module.output_contract.strip():
                module_parts.append(f"OUTPUT CONTRACT:\n{module.output_contract.strip()}")
            elif isinstance(module.output_contract, (dict, list)):
                module_parts.append(f"OUTPUT CONTRACT:\n{json.dumps(module.output_contract, indent=2)}")

        # Output mapping
        output_mapping_text = format_module_output_mapping(ref.output_mapping)
        if output_mapping_text:
            module_parts.append(f"OUTPUT:\n{output_mapping_text}")

        # Module examples (if any)
        module_examples_text = format_examples_section(module.examples)
        if module_examples_text:
            module_parts.append(f"EXAMPLES:\n{module_examples_text}")

        sections.append("\n\n".join(module_parts))

        # Build structured module entry
        structured_modules.append({
            "name": module.name,
            "description": module.description.strip() if module.description else None,
            "instructions": module.instructions.strip() if module.instructions else None,
            "input_context": ref.input_mapping if ref.input_mapping else module.input_context,
            "output_contract": module.output_contract,
            "output_mapping": ref.output_mapping if ref.output_mapping else None,
        })

    # 7. Output Requirements
    output_req_text = format_output_format_section(prompt_system.output_format)
    if output_req_text:
        sections.append(f"OUTPUT REQUIREMENTS\n\n{output_req_text}")

    raw_prompt = "\n\n".join(sections)

    structured_prompt: Dict[str, Any] = {
        "instructions": instructions_text,
        "variables": prompt_system.variables if prompt_system.variables else [],
        "examples": prompt_system.examples if prompt_system.examples else [],
        "modules": structured_modules,
        "output_requirements": prompt_system.output_format,
    }

    return raw_prompt, structured_prompt


async def compose_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> str:
    """Assemble a PromptSystem into a single final composed prompt text."""
    raw_prompt, _ = await assemble_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
    )
    return raw_prompt


async def preview_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
) -> Dict[str, Any]:
    """Assemble a PromptSystem into raw composed prompt text and structured sections."""
    raw_prompt, structured = await assemble_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
    )
    return {
        "prompt_system_id": prompt_system_id,
        "raw_prompt": raw_prompt,
        "structured_prompt": structured,
    }
