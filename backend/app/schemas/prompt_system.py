"""PromptSystem and Variable request and response schemas."""
import re
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator


class VariableType(str, Enum):
    """Allowed variable types according to PromptForge specification."""
    TEXT = "text"
    NUMBER = "number"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    SELECT = "select"
    MULTILINE = "multiline"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            val_lower = value.lower().strip()
            if val_lower in ("string", "str"):
                return cls.TEXT
            if val_lower in ("int", "integer"):
                return cls.INTEGER
            if val_lower in ("bool", "boolean"):
                return cls.BOOLEAN
            if val_lower in ("num", "float"):
                return cls.NUMBER
        return None


class VariableDefinition(BaseModel):
    """Schema defining a Prompt System variable."""

    name: str = Field(..., description="Unique variable name suitable for {variable_name}")
    label: Optional[str] = Field(None, description="Human-readable variable label")
    type: VariableType = Field(default=VariableType.TEXT, description="Variable type (text, number, select, multiline)")
    required: bool = Field(default=True, description="Whether the variable is required")
    default: Optional[Any] = Field(None, description="Optional default value")
    description: Optional[str] = Field(None, description="Optional variable description")
    options: Optional[List[Any]] = Field(default=None, description="Optional choices for select variable type")

    @field_validator("name")
    @classmethod
    def validate_variable_name(cls, value: str) -> str:
        """Validate variable name has no spaces and is a valid identifier."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("Variable name cannot be empty.")
        if " " in stripped:
            raise ValueError("Variable name cannot contain spaces.")
        if not re.match(r"^[a-zA-Z0-9_]+$", stripped):
            raise ValueError("Variable name can only contain alphanumeric characters and underscores.")
        return stripped

    def model_post_init(self, __context: Any) -> None:
        """Set default label to name if not provided."""
        if not self.label:
            self.label = self.name


def _validate_variables_list(variables_value: Optional[Union[List[Any], Dict[str, Any]]]):
    """Helper to validate unique variable names and definition schemas."""
    if variables_value is None:
        return variables_value
    if isinstance(variables_value, list):
        validated_items = []
        names_seen = set()
        for item in variables_value:
            if isinstance(item, dict):
                var_def = VariableDefinition(**item)
                if var_def.name in names_seen:
                    raise ValueError(f"Duplicate variable name '{var_def.name}' found in Prompt System.")
                names_seen.add(var_def.name)
                validated_items.append(item)
            elif isinstance(item, VariableDefinition):
                if item.name in names_seen:
                    raise ValueError(f"Duplicate variable name '{item.name}' found in Prompt System.")
                names_seen.add(item.name)
                validated_items.append(item.model_dump())
            else:
                validated_items.append(item)
        return validated_items
    return variables_value


class PromptSystemBase(BaseModel):
    """Base schema for PromptSystem properties."""

    name: str = Field(..., min_length=1, max_length=255, description="Prompt System name")
    description: Optional[str] = Field(None, description="Optional description")
    instructions: Optional[str] = Field(None, description="Core system instructions")
    variables: Optional[Union[List[Any], Dict[str, Any]]] = Field(
        default_factory=list,
        description="Variables definitions",
    )
    examples: Optional[Union[List[Any], Dict[str, Any]]] = Field(
        default_factory=list,
        description="Prompt examples",
    )
    output_format: Optional[Union[str, Dict[str, Any], List[Any]]] = Field(
        default_factory=dict,
        description="Output format specification",
    )
    modules: Optional[Union[List[Any], Dict[str, Any]]] = Field(
        default_factory=list,
        description="Module references / configuration",
    )
    ai_provider: Optional[str] = Field(None, description="Optional configured AI provider (openai, anthropic, gemini, groq)")
    model: Optional[str] = Field(None, description="Optional configured model identifier")

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, value: str) -> str:
        """Ensure name is not empty or composed solely of whitespace."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("Prompt System name cannot be empty or whitespace only.")
        return stripped

    @field_validator("variables")
    @classmethod
    def validate_variables(cls, value: Optional[Union[List[Any], Dict[str, Any]]]):
        """Ensure variable names are valid and unique within PromptSystem."""
        return _validate_variables_list(value)


class PromptSystemCreate(PromptSystemBase):
    """Schema for creating a new PromptSystem."""
    pass


class PromptSystemUpdate(BaseModel):
    """Schema for updating an existing PromptSystem."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    instructions: Optional[str] = None
    variables: Optional[Union[List[Any], Dict[str, Any]]] = None
    examples: Optional[Union[List[Any], Dict[str, Any]]] = None
    output_format: Optional[Union[str, Dict[str, Any], List[Any]]] = None
    modules: Optional[Union[List[Any], Dict[str, Any]]] = None
    visibility: Optional[str] = None
    ai_provider: Optional[str] = None
    model: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name_if_provided(cls, value: Optional[str]) -> Optional[str]:
        """Ensure updated name is not empty if provided."""
        if value is not None:
            stripped = value.strip()
            if not stripped:
                raise ValueError("Prompt System name cannot be empty or whitespace only.")
            return stripped
        return value

    @field_validator("variables")
    @classmethod
    def validate_variables(cls, value: Optional[Union[List[Any], Dict[str, Any]]]):
        """Ensure variable names are valid and unique within PromptSystem."""
        return _validate_variables_list(value)


class PromptSystemResponse(BaseModel):
    """Schema for returning PromptSystem details."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    owner_id: int
    instructions: Optional[str] = None
    variables: Optional[Any] = None
    examples: Optional[Any] = None
    output_format: Optional[Union[str, Dict[str, Any], List[Any]]] = None
    modules: Optional[Any] = None
    version: int
    archived: bool = False
    visibility: str = "private"
    share_token: Optional[str] = None
    ai_provider: Optional[str] = None
    model: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class VariableValidationResponse(BaseModel):
    """Schema for response of POST /prompt-systems/{id}/variables/validate."""

    valid: bool
    detected_variables: List[str]
    configured_variables: List[str]
    missing_variables: List[str]
    unused_variables: List[str]
