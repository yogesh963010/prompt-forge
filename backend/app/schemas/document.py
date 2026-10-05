"""Schemas for Document metadata and API responses."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class DocumentBase(BaseModel):
    filename: str
    prompt_system_id: int
    module_id: Optional[int] = None
    conversation_id: Optional[int] = None


class DocumentResponse(DocumentBase):
    id: str
    user_id: int
    stored_filename: str
    file_size: int
    content_type: str
    railway_document_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentItemContext(BaseModel):
    id: str
    filename: str
    content: str


class DocumentContextResponse(BaseModel):
    documents: List[DocumentItemContext]
    context_text: str
    count: int


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
