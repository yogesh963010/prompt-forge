"""AI Provider request and response schemas."""
from typing import Dict
from pydantic import BaseModel, Field


class ProviderCapabilities(BaseModel):
    """Capabilities supported by the provider."""

    open: bool = Field(default=True, description="Whether the provider can be opened in browser/web")
    run: bool = Field(default=False, description="Whether direct API execution is supported in this MVP")
    copy_prompt: bool = Field(default=True, description="Whether the prompt is copied for the provider")


class ProviderResponse(BaseModel):
    """Metadata response for a registered AI provider."""

    id: str = Field(..., description="Unique provider identifier (e.g. chatgpt, claude, groq, gemini)")
    name: str = Field(..., description="Human-readable provider display name")
    capabilities: ProviderCapabilities = Field(..., description="Provider capabilities")


class ProviderActionRequest(BaseModel):
    """Request schema for executing a provider destination action."""

    resolved_prompt: str = Field(..., description="The fully resolved prompt text from Branch 17 Prompt Run")


class ProviderActionResponse(BaseModel):
    """Response schema from a provider destination action."""

    provider_id: str = Field(..., description="ID of the selected provider")
    provider_name: str = Field(..., description="Name of the selected provider")
    url: str = Field(..., description="Destination URL defined by provider implementation")
    resolved_prompt: str = Field(..., description="The unchanged resolved prompt text")
    action: str = Field(default="open", description="Action to perform (e.g. open)")
    copy_prompt: bool = Field(default=True, description="Whether the prompt should be copied to clipboard")
