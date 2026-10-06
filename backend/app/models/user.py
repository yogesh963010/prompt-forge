"""User database model definition."""
from datetime import datetime
from typing import List, TYPE_CHECKING
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database.base import Base

if TYPE_CHECKING:
    from .prompt_system import PromptSystem
    from .prompt_module import PromptModule
    from .ai_provider_credential import AIProviderCredential


class User(Base):
    """User account model for PromptForge."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
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
    prompt_systems: Mapped[List["PromptSystem"]] = relationship(
        "PromptSystem",
        back_populates="owner",
        cascade="all, delete-orphan",
    )
    prompt_modules: Mapped[List["PromptModule"]] = relationship(
        "PromptModule",
        back_populates="owner",
        cascade="all, delete-orphan",
    )
    ai_provider_credentials: Mapped[List["AIProviderCredential"]] = relationship(
        "AIProviderCredential",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"
