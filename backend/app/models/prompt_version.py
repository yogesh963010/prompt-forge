"""PromptVersion database model definition."""
from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database.base import Base

if TYPE_CHECKING:
    from .prompt_system import PromptSystem
    from .user import User


class PromptVersion(Base):
    """PromptVersion model representing an immutable historical snapshot of a PromptSystem."""

    __tablename__ = "prompt_versions"
    __test__ = False

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    prompt_system_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prompt_systems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    configuration_snapshot: Mapped[Dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
    )
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationships
    prompt_system: Mapped["PromptSystem"] = relationship(
        "PromptSystem",
        back_populates="versions",
    )
    creator: Mapped["User"] = relationship(
        "User",
    )

    def __repr__(self) -> str:
        return (
            f"<PromptVersion id={self.id} "
            f"prompt_system_id={self.prompt_system_id} "
            f"version_number={self.version_number} "
            f"created_by={self.created_by}>"
        )
