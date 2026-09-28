"""TestCase request and response schemas."""
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class TestCaseCreate(BaseModel):
    """Schema for creating a new TestCase."""

    name: str = Field(..., min_length=1, max_length=255, description="Name of the test case")
    variables: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Sample runtime values for prompt variables",
    )
    expected_behavior: Optional[Any] = Field(
        default=None,
        description="Expected behavior or evaluation criteria for the Prompt System",
    )

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, value: str) -> str:
        """Ensure test case name is not empty or composed solely of whitespace."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("Test case name cannot be empty or whitespace only.")
        return stripped


class TestCaseUpdate(BaseModel):
    """Schema for updating an existing TestCase."""

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Name of the test case")
    variables: Optional[Dict[str, Any]] = Field(
        None,
        description="Sample runtime values for prompt variables",
    )
    expected_behavior: Optional[Any] = Field(
        None,
        description="Expected behavior or evaluation criteria for the Prompt System",
    )

    @field_validator("name")
    @classmethod
    def validate_name_if_provided(cls, value: Optional[str]) -> Optional[str]:
        """Ensure updated name is not empty if provided."""
        if value is not None:
            stripped = value.strip()
            if not stripped:
                raise ValueError("Test case name cannot be empty or whitespace only.")
            return stripped
        return value


class TestCaseResponse(BaseModel):
    """Schema for returning TestCase details."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt_system_id: int
    name: str
    variables: Optional[Dict[str, Any]] = None
    expected_behavior: Optional[Any] = None
    created_at: datetime


class TestCaseRunResponse(BaseModel):
    """Schema for returning the result of running a test case."""

    test_case_id: int
    prompt_system_id: int
    resolved_prompt: str
    generated_output: str
    name: Optional[str] = None
    variables: Optional[Dict[str, Any]] = None
    expected_behavior: Optional[Any] = None
