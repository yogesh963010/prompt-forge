"""Composer request and response schemas."""
from pydantic import BaseModel, Field


class ComposerResponse(BaseModel):
    """Response schema for composed prompt system."""

    prompt_system_id: int = Field(..., description="ID of the composed PromptSystem")
    prompt: str = Field(..., description="The final assembled prompt as text")
