"""Prompt Run request and response schemas for Branch 17: Prompt Run."""
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class PromptRunRequest(BaseModel):
    """Schema for running a Prompt System with runtime variables."""

    variables: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Runtime values for configured prompt variables",
    )


class PromptRunResponse(BaseModel):
    """Schema for returning the result of a Prompt Run."""

    prompt_system_id: int = Field(..., description="ID of the Prompt System that was run")
    variables: Dict[str, Any] = Field(
        default_factory=dict,
        description="Validated runtime variables with defaults applied",
    )
    resolved_prompt: str = Field(
        ...,
        description="Final composed prompt with runtime variables substituted",
    )
