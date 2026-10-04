"""Document model definition for isolated PDF upload and management."""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database.base import Base

if TYPE_CHECKING:
    from .user import User
    from .prompt_system import PromptSystem
    from .prompt_module import PromptModule


class Document(Base):
    """Document model representing an uploaded PDF file associated with a user,

    prompt system, and optionally a child prompt module.
    """

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    prompt_system_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prompt_systems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("prompt_modules.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="application/pdf",
        server_default="application/pdf",
    )
    railway_document_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
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
    owner: Mapped["User"] = relationship("User", backref="documents")
    prompt_system: Mapped["PromptSystem"] = relationship("PromptSystem")
    module: Mapped[Optional["PromptModule"]] = relationship("PromptModule")

    def __repr__(self) -> str:
        return (
            f"<Document id='{self.id}' user_id={self.user_id} "
            f"prompt_system_id={self.prompt_system_id} module_id={self.module_id} "
            f"filename='{self.filename}'>"
        )
