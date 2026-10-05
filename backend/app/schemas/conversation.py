from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, Field

class MessageBase(BaseModel):
    role: str = Field(..., description="Role of the message sender: user, assistant, system, or client")
    content: str = Field(..., min_length=1)

class MessageCreate(MessageBase):
    pass

class MessageRead(MessageBase):
    id: int
    conversation_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ConversationBase(BaseModel):
    title: Optional[str] = None
    prompt_system_id: Optional[int] = None
    module_id: Optional[int] = None
    variables: Optional[dict] = Field(default_factory=dict)

class ConversationCreate(ConversationBase):
    pass

class ConversationUpdate(BaseModel):
    title: Optional[str] = None

class ConversationRead(ConversationBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AssistantContextResponse(BaseModel):
    parent_context: Any = Field(default_factory=dict)
    parent_instructions: Optional[str] = None
    current_child_context: Any = Field(default_factory=dict)
    current_child_instructions: Optional[str] = None
    previous_child_context: List[Any] = Field(default_factory=list)
    current_conversation_history: List[MessageRead] = Field(default_factory=list)
