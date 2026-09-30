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
    selected_module_id: Optional[int] = None,
    runtime_previous_output: Optional[str] = None,
    runtime_user_input: Optional[str] = None,
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

    instructions_text = None
    if prompt_system.instructions and prompt_system.instructions.strip():
        instructions_text = prompt_system.instructions.strip()

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

    if not references:
        # Standalone Prompt System with no enabled modules: include parent prompt sections
        if instructions_text:
            sections.append(f"SYSTEM INSTRUCTIONS\n\n{instructions_text}")

        variables_text = format_variables_section(prompt_system.variables)
        if variables_text:
            sections.append(f"VARIABLES / CONTEXT\n\n{variables_text}")

        examples_text = format_examples_section(prompt_system.examples)
        if examples_text:
            sections.append(f"EXAMPLES\n\n{examples_text}")

        output_req_text = format_output_format_section(prompt_system.output_format)
        if output_req_text:
            sections.append(f"OUTPUT REQUIREMENTS\n\n{output_req_text}")
    else:
        # If selected_module_id is specified, execute ONLY the selected module
        if selected_module_id is not None:
            active_references = [
                r for r in references
                if r.module_id == selected_module_id or (r.prompt_module and r.prompt_module.id == selected_module_id)
            ]
            if not active_references:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Selected module ID {selected_module_id} is not enabled or not attached to this Prompt System.",
                )
        else:
            active_references = references

        # System has enabled modules: Do NOT prepend parent prompt unconditionally!
        # Context boundaries control what external/parent context each module receives.
        for ref in active_references:
            module = ref.prompt_module
            if not module:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Referenced module ID {ref.module_id} not found.",
                )

            # Enforce ownership rules
            if module.owner_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"You do not have access to referenced module ID {ref.module_id}.",
                )

            module_parts: List[str] = [f"MODULE: {module.name}"]

            # Module Description
            if module.description and module.description.strip():
                module_parts.append(f"DESCRIPTION:\n{module.description.strip()}")

            # Module Instructions
            if module.instructions and module.instructions.strip():
                module_parts.append(f"INSTRUCTIONS:\n{module.instructions.strip()}")

            # Extract selected context boundaries
            selected_contexts = set()
            if isinstance(module.input_context, list):
                for item in module.input_context:
                    if isinstance(item, str):
                        selected_contexts.add(item.strip())
                    elif isinstance(item, dict):
                        name = item.get("name") or item.get("key")
                        if name:
                            selected_contexts.add(str(name).strip())
            elif isinstance(module.input_context, dict):
                selected_contexts.update(k.strip() for k in module.input_context.keys())
            elif isinstance(module.input_context, str):
                selected_contexts.add(module.input_context.strip())

            # Check if preset keys were supplied in ref.input_mapping
            if isinstance(ref.input_mapping, dict):
                for k, v in ref.input_mapping.items():
                    if k in {"parent_variables", "parent_instructions", "previous_module_output", "user_input"}:
                        selected_contexts.add(k)
                    if isinstance(v, str) and v.strip("{}") in {"parent_variables", "parent_instructions", "previous_module_output", "user_input"}:
                        selected_contexts.add(v.strip("{}"))

            # 1. Parent Instructions (only when parent_instructions is selected)
            if "parent_instructions" in selected_contexts:
                if instructions_text:
                    module_parts.append(f"PARENT INSTRUCTIONS:\n{instructions_text}")

            # 2. Parent Variables (only when parent_variables is selected)
            if "parent_variables" in selected_contexts:
                vars_text = format_variables_section(prompt_system.variables)
                if vars_text:
                    module_parts.append(f"PARENT VARIABLES:\n{vars_text}")

            # Module Variables (defined by the module itself)
            module_vars_text = format_variables_section(module.variables)
            if module_vars_text:
                module_parts.append(f"MODULE VARIABLES:\n{module_vars_text}")

            # Custom input mapping (for variable-to-param mappings not matching preset names)
            if isinstance(ref.input_mapping, dict):
                custom_lines = []
                for param, source in ref.input_mapping.items():
                    if param not in {"parent_variables", "parent_instructions", "previous_module_output", "user_input"}:
                        clean_source = str(source).strip().strip("{}")
                        clean_param = str(param).strip()
                        custom_lines.append(f"{clean_param}: {{{clean_source}}}")
                if custom_lines:
                    module_parts.append("INPUT CONTEXT:\n" + "\n".join(custom_lines))

            # 3. Previous Module Output (only when previous_module_output is selected)
            if "previous_module_output" in selected_contexts:
                if runtime_previous_output is not None and str(runtime_previous_output).strip() != "":
                    module_parts.append(f"PREVIOUS MODULE OUTPUT:\n{str(runtime_previous_output).strip()}")
                else:
                    # Find original index in full list of references
                    orig_idx = -1
                    for idx, r in enumerate(references):
                        if r.id == ref.id:
                            orig_idx = idx
                            break
                    if orig_idx > 0:
                        prev_ref = references[orig_idx - 1]
                        prev_mod = prev_ref.prompt_module
                        if prev_ref.output_mapping and isinstance(prev_ref.output_mapping, dict):
                            prev_out = format_module_output_mapping(prev_ref.output_mapping)
                        else:
                            clean_name = prev_mod.name.lower().replace(" ", "_") if prev_mod else "previous_module"
                            prev_out = f"{{{clean_name}_output}}"
                        if prev_out:
                            module_parts.append(f"PREVIOUS MODULE OUTPUT:\n{prev_out}")

            # 4. User Input (only when user_input is selected)
            if "user_input" in selected_contexts:
                if runtime_user_input is not None and str(runtime_user_input).strip() != "":
                    module_parts.append(f"USER INPUT:\n{str(runtime_user_input).strip()}")
                else:
                    module_parts.append("USER INPUT:\n{user_input}")

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

            # Module examples
            module_examples_text = format_examples_section(module.examples)
            if module_examples_text:
                module_parts.append(f"EXAMPLES:\n{module_examples_text}")

            sections.append("\n\n".join(module_parts))

            # Build structured module entry
            structured_modules.append({
                "name": module.name,
                "description": module.description.strip() if module.description else None,
                "instructions": module.instructions.strip() if module.instructions else None,
                "variables": module.variables if module.variables else [],
                "input_context": ref.input_mapping if ref.input_mapping else (list(selected_contexts) if selected_contexts else []),
                "output_contract": module.output_contract,
                "output_mapping": ref.output_mapping if ref.output_mapping else None,
            })

        # 7. Output Requirements (if prompt_system.output_format is configured)
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
    selected_module_id: Optional[int] = None,
    runtime_previous_output: Optional[str] = None,
    runtime_user_input: Optional[str] = None,
) -> str:
    """Assemble a PromptSystem into a single final composed prompt text."""
    raw_prompt, _ = await assemble_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
        selected_module_id=selected_module_id,
        runtime_previous_output=runtime_previous_output,
        runtime_user_input=runtime_user_input,
    )
    return raw_prompt


async def preview_prompt_system(
    db: AsyncSession,
    prompt_system_id: int,
    user_id: int,
    selected_module_id: Optional[int] = None,
    runtime_previous_output: Optional[str] = None,
    runtime_user_input: Optional[str] = None,
) -> Dict[str, Any]:
    """Assemble a PromptSystem into raw composed prompt text and structured sections."""
    raw_prompt, structured = await assemble_prompt_system(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=user_id,
        selected_module_id=selected_module_id,
        runtime_previous_output=runtime_previous_output,
        runtime_user_input=runtime_user_input,
    )
    return {
        "prompt_system_id": prompt_system_id,
        "raw_prompt": raw_prompt,
        "structured_prompt": structured,
    }
