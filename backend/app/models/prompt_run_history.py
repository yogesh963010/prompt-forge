"""PromptRunHistory database model definition."""
from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING
from sqlalchemy import (
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
    from .prompt_system import PromptSystem
    from .prompt_module import PromptModule


class PromptRunHistory(Base):
    """PromptRunHistory model representing an immutable historical snapshot of a completed Prompt Run."""

    __tablename__ = "prompt_run_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    prompt_system_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("prompt_systems.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    module_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("prompt_modules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    prompt_system_name: Mapped[str] = mapped_column(String(255), nullable=False)
    module_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    final_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    runtime_variables: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Optional relationships
    user: Mapped["User"] = relationship("User")
    prompt_system: Mapped[Optional["PromptSystem"]] = relationship("PromptSystem")
    prompt_module: Mapped[Optional["PromptModule"]] = relationship("PromptModule")
