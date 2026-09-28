"""Prompt rendering and variable substitution utility."""
from typing import Any, Dict, Optional


def render_prompt(template: str, variables: Optional[Dict[str, Any]] = None) -> str:
    """Resolve variable placeholders like {var_name} in a composed prompt template.

    Args:
        template: The composed prompt template string.
        variables: Dictionary mapping variable names to their runtime sample values.

    Returns:
        The prompt string with matching {var_name} placeholders replaced by runtime values.
        Unmatched placeholders remain intact. The original template string is never mutated.

    Example:
        template = "Write a {topic} article for {audience}."
        variables = {"topic": "Kubernetes networking", "audience": "software engineers"}
        render_prompt(template, variables)
        -> "Write a Kubernetes networking article for software engineers."
    """
    if not template:
        return ""
    if not variables:
        return template

    resolved = template
    for key, val in variables.items():
        if val is not None:
            placeholder = f"{{{key}}}"
            resolved = resolved.replace(placeholder, str(val))

    return resolved
