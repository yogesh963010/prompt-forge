"""Prompt Run request and response schemas for Branch 17: Prompt Run."""
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class PromptRunRequest(BaseModel):
    """Schema for running a Prompt System with runtime variables."""

    module_id: Optional[int] = Field(
        default=None,
        description="Optional module ID if running a specific module",
    )
    variables: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Runtime values for configured prompt variables",
    )
    module_variables: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Runtime values for module-defined variables",
    )
    user_input: Optional[str] = Field(
        default=None,
        description="Runtime user input if user_input context is enabled",
    )
    previous_module_output: Optional[str] = Field(
        default=None,
        description="Runtime previous module output if previous_module_output context is enabled",
    )


class PromptRunResponse(BaseModel):
    """Schema for returning the result of a Prompt Run."""

    prompt_system_id: int = Field(..., description="ID of the Prompt System that was run")
    module_id: Optional[int] = Field(
        default=None,
        description="ID of the specific module run, if applicable",
    )
    variables: Dict[str, Any] = Field(
        default_factory=dict,
        description="Validated runtime variables with defaults applied",
    )
    module_variables: Dict[str, Any] = Field(
        default_factory=dict,
        description="Validated runtime module variables with defaults applied",
    )
    user_input: Optional[str] = Field(
        default=None,
        description="Runtime user input if provided",
    )
    previous_module_output: Optional[str] = Field(
        default=None,
        description="Runtime previous module output if provided",
    )
    resolved_prompt: str = Field(
        ...,
        description="Final composed prompt with runtime variables substituted",
    )
