"""Pydantic schemas for Prompt Run History."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PromptRunHistoryItemResponse(BaseModel):
    """Schema for a single prompt run history record."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    prompt_system_id: Optional[int] = None
    module_id: Optional[int] = None
    prompt_system_name: str
    module_name: Optional[str] = None
    final_prompt: str
    runtime_variables: Optional[Dict[str, Any]] = None
    created_at: datetime


class PromptRunHistoryListResponse(BaseModel):
    """Schema for a list of prompt run history records."""
    items: List[PromptRunHistoryItemResponse] = Field(default_factory=list)
