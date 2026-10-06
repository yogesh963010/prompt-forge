"""PromptSystem database model definition."""
from datetime import datetime
from typing import Any, List, Optional, TYPE_CHECKING
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database.base import Base

if TYPE_CHECKING:
    from .user import User
    from .module_reference import ModuleReference
    from .test_case import TestCase
    from .prompt_version import PromptVersion


class PromptSystem(Base):
    """PromptSystem model representing a user-defined prompt structure."""

    __tablename__ = "prompt_systems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Visibility of the prompt system: private (default) or public_link
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default='private', server_default='private')
    # Secure token used when visibility is public_link; null otherwise
    share_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    variables: Mapped[Optional[Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=dict,
    )
    examples: Mapped[Optional[Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=list,
    )
    output_format: Mapped[Optional[Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=dict,
    )
    modules: Mapped[Optional[Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=list,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false", index=True)
    # AI Provider & Model configuration for Bring Your Own Key (BYOK)
    ai_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default=None)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default=None)
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

    # Relationship to owning user
    owner: Mapped["User"] = relationship("User", back_populates="prompt_systems")

    # Relationship to ModuleReferences (deleted with system via cascade)
    module_references: Mapped[List["ModuleReference"]] = relationship(
        "ModuleReference",
        back_populates="prompt_system",
        cascade="all, delete-orphan",
    )

    # Relationship to TestCases (deleted with system via cascade)
    test_cases: Mapped[List["TestCase"]] = relationship(
        "TestCase",
        back_populates="prompt_system",
        cascade="all, delete-orphan",
    )

    # Relationship to PromptVersions (deleted with system via cascade)
    versions: Mapped[List["PromptVersion"]] = relationship(
        "PromptVersion",
        back_populates="prompt_system",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PromptSystem id={self.id} name='{self.name}' owner_id={self.owner_id} version={self.version}>"
