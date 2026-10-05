"""Conversation and Message models definition."""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    JSON,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database.base import Base

if TYPE_CHECKING:
    from .user import User
    from .prompt_system import PromptSystem
    from .prompt_module import PromptModule


class Conversation(Base):
    """Conversation model representing a chat thread for an assistant."""

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    prompt_system_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("prompt_systems.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    module_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("prompt_modules.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    variables: Mapped[Optional[dict]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", backref="conversations")
    prompt_system: Mapped[Optional["PromptSystem"]] = relationship("PromptSystem")
    module: Mapped[Optional["PromptModule"]] = relationship("PromptModule")
    
    messages: Mapped[List["Message"]] = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} user_id={self.user_id} title='{self.title}'>"


class Message(Base):
    """Message model representing a single message in a conversation."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationship
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")

    def __repr__(self) -> str:
        return f"<Message id={self.id} conversation_id={self.conversation_id} role='{self.role}'>"
