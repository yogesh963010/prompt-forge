"""Schemas for BYOK (Bring Your Own Key) AI Provider Credentials API.

SECURITY:
- No schema ever exposes the raw or decrypted API key.
- Responses only contain masked_api_key (safe suffix display).
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

SUPPORTED_PROVIDERS = {"openai", "anthropic", "gemini", "groq"}

PROVIDER_DISPLAY_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic / Claude",
    "gemini": "Google Gemini",
    "groq": "Groq",
}


class AIProviderCredentialUpsert(BaseModel):
    """Request body for creating or updating a provider API key."""

    provider: str = Field(
        ...,
        description="Provider identifier: openai | anthropic | gemini | groq",
    )
    api_key: str = Field(
        ...,
        min_length=1,
        description="The raw API key to encrypt and store. Never stored as plain text.",
    )

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in SUPPORTED_PROVIDERS:
            raise ValueError(
                f"Unsupported provider '{v}'. Must be one of: {', '.join(sorted(SUPPORTED_PROVIDERS))}."
            )
        return normalized

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("API key cannot be empty.")
        return stripped


class AIProviderCredentialResponse(BaseModel):
    """Safe response for a single provider credential — never exposes the real key."""

    provider: str = Field(..., description="Provider identifier")
    provider_name: str = Field(..., description="Human-readable provider name")
    configured: bool = Field(..., description="Whether a key has been saved")
    masked_api_key: Optional[str] = Field(
        None,
        description="Masked representation: ••••••••<last 4 chars>. Null if not configured.",
    )
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AIProviderCredentialListResponse(BaseModel):
    """Response listing all four providers with their configuration status."""

    credentials: List[AIProviderCredentialResponse]


class TestConnectionResponse(BaseModel):
    """Response for the test-connection endpoint."""

    provider: str
    success: bool
    message: str
