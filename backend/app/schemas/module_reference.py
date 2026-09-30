"""ModuleReference request and response schemas."""
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ModuleReferenceCreate(BaseModel):
    """Schema for attaching a PromptModule to a PromptSystem."""

    module_id: int = Field(..., description="ID of the PromptModule to attach")
    input_mapping: Optional[Union[Dict[str, Any], Any]] = Field(
        default_factory=dict,
        description="JSON mapping of PromptSystem variables to module inputs",
    )
    output_mapping: Optional[Union[Dict[str, Any], Any]] = Field(
        default_factory=dict,
        description="JSON mapping of module outputs into PromptSystem context",
    )
    enabled: bool = Field(default=True, description="Whether the module reference is active")

    @field_validator("input_mapping", "output_mapping", mode="before")
    @classmethod
    def coerce_mapping_to_dict(cls, value: Any) -> Any:
        """Accept None as empty dict; ensure value is JSON-compatible."""
        if value is None:
            return {}
        return value


class ModuleReferenceUpdate(BaseModel):
    """Schema for updating an existing ModuleReference via PATCH."""

    input_mapping: Optional[Union[Dict[str, Any], Any]] = Field(
        None,
        description="Updated JSON mapping of PromptSystem variables to module inputs",
    )
    output_mapping: Optional[Union[Dict[str, Any], Any]] = Field(
        None,
        description="Updated JSON mapping of module outputs into PromptSystem context",
    )
    enabled: Optional[bool] = Field(None, description="Enable or disable this module reference")

    @field_validator("input_mapping", "output_mapping", mode="before")
    @classmethod
    def coerce_mapping_to_dict(cls, value: Any) -> Any:
        """Accept None as empty dict when explicitly provided."""
        return value


class ModuleReferenceResponse(BaseModel):
    """Schema for returning ModuleReference details to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt_system_id: int
    module_id: int
    module_name: Optional[str] = None
    module_variables: Optional[List[Any]] = Field(default_factory=list)
    module_input_context: Optional[List[str]] = Field(default_factory=list)
    input_mapping: Optional[Any] = None
    output_mapping: Optional[Any] = None
    enabled: bool
    created_at: datetime
    updated_at: datetime
