"""TestCase database model definition."""
from datetime import datetime
from typing import Any, Optional, TYPE_CHECKING
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database.base import Base

if TYPE_CHECKING:
    from .prompt_system import PromptSystem


class TestCase(Base):
    """TestCase model representing sample variable inputs and expected behavior for a PromptSystem."""

    __tablename__ = "test_cases"
    __test__ = False

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    prompt_system_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("prompt_systems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    variables: Mapped[Optional[Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=dict,
    )
    expected_behavior: Mapped[Optional[Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationship to owning PromptSystem
    prompt_system: Mapped["PromptSystem"] = relationship(
        "PromptSystem",
        back_populates="test_cases",
    )

    def __repr__(self) -> str:
        return f"<TestCase id={self.id} name='{self.name}' prompt_system_id={self.prompt_system_id}>"
