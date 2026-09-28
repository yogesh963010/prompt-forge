"""PromptVersion request and response schemas."""
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class PromptVersionCreate(BaseModel):
    """Schema for creating a new PromptVersion snapshot."""

    change_note: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional note describing the changes captured in this version",
    )


class PromptVersionResponse(BaseModel):
    """Schema for returning PromptVersion details."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt_system_id: int
    version_number: int
    configuration_snapshot: Dict[str, Any]
    change_note: Optional[str] = None
    created_at: datetime
    created_by: int


class PromptVersionCompareResponse(BaseModel):
    """Schema for returning comparison between two versions."""

    version_a: int
    version_b: int
    changes: Dict[str, Any]


class PromptVersionRestoreResponse(BaseModel):
    """Schema for returning the result of restoring a previous version."""

    message: str
    prompt_system_id: int
    restored_from_version: int
    new_version_number: int
    version: PromptVersionResponse
