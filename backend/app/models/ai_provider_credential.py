"""AI Provider Credential database model for BYOK (Bring Your Own Key).

Each record stores one encrypted API key per user per provider.
The unique constraint (user_id, provider) enforces one credential per provider.

SECURITY:
- encrypted_api_key stores the Fernet-encrypted token ONLY.
- The plain-text key is NEVER stored.
- The master encryption key is NEVER stored in the database.
"""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..database.base import Base

if TYPE_CHECKING:
    from .user import User

# Canonical provider identifier values
SUPPORTED_PROVIDERS = {"openai", "anthropic", "gemini", "groq"}


class AIProviderCredential(Base):
    """Encrypted AI provider API key associated with a user."""

    __tablename__ = "ai_provider_credentials"

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_provider"),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, autoincrement=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Provider identifier: openai | anthropic | gemini | groq
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    # Fernet-encrypted API key token — NEVER the plain-text key
    encrypted_api_key: Mapped[str] = mapped_column(String(1024), nullable=False)

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

    # Relationship to owning User
    owner: Mapped["User"] = relationship("User", back_populates="ai_provider_credentials")

    def __repr__(self) -> str:
        return f"<AIProviderCredential user_id={self.user_id} provider={self.provider}>"
