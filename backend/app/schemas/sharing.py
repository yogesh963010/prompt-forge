"""Sharing schemas for PromptForge."""
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class SharingStatusResponse(BaseModel):
    """Response containing sharing visibility and URL/token."""
    visibility: str = Field(..., description="Visibility mode: 'private' or 'public_link'")
    share_token: Optional[str] = Field(None, description="Public share token if active")
    share_url: Optional[str] = Field(None, description="Share URL path if active")


class SharingUpdateRequest(BaseModel):
    """Request payload to change sharing visibility."""
    visibility: str = Field(..., description="Target visibility: 'private' or 'public_link'")


class PublicSharedModule(BaseModel):
    """Publicly safe representation of an attached module."""
    id: int
    name: str
    description: Optional[str] = None
    variables: Optional[Any] = None


class PublicSharedSystemResponse(BaseModel):
    """Public representation of a shared Prompt System without internal IDs or user data."""
    share_token: str
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    variables: Optional[Any] = None
    examples: Optional[Any] = None
    output_format: Optional[Any] = None
    modules: Optional[Any] = None
    attached_modules: List[PublicSharedModule] = []
    created_at: datetime
    updated_at: datetime
