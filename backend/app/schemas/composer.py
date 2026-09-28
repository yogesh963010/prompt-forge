"""Composer and Preview request and response schemas."""
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class ComposerResponse(BaseModel):
    """Response schema for composed prompt system."""

    prompt_system_id: int = Field(..., description="ID of the composed PromptSystem")
    prompt: str = Field(..., description="The final assembled prompt as text")


class StructuredModule(BaseModel):
    """Structured representation of an attached module in preview."""

    name: str = Field(..., description="Module name")
    description: Optional[str] = Field(None, description="Module description")
    instructions: Optional[str] = Field(None, description="Module instructions")
    input_context: Optional[Any] = Field(None, description="Configured input context or mapping")
    output_contract: Optional[Any] = Field(None, description="Module output contract")
    output_mapping: Optional[Any] = Field(None, description="Module output mapping")


class StructuredPrompt(BaseModel):
    """Structured sections of the composed prompt."""

    instructions: Optional[str] = Field(None, description="Core system instructions")
    variables: Optional[Any] = Field(None, description="System variables definitions")
    examples: Optional[Any] = Field(None, description="System examples")
    modules: List[StructuredModule] = Field(default_factory=list, description="Enabled attached modules")
    output_requirements: Optional[Any] = Field(None, description="Configured output requirements")


class PreviewResponse(BaseModel):
    """Response schema for Prompt Preview endpoint."""

    prompt_system_id: int = Field(..., description="ID of the previewed PromptSystem")
    raw_prompt: str = Field(..., description="The exact composed prompt as raw text")
    structured_prompt: StructuredPrompt = Field(..., description="Structured breakdown of composed sections")
