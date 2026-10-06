"""015_create_ai_provider_credentials_table

Creates the ai_provider_credentials table for BYOK (Bring Your Own Key).
Stores encrypted API keys per user per provider.

Revision ID: 015
Revises: 8826e243c0d8
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014_add_share_to_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_provider_credentials",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("encrypted_api_key", sa.String(length=1024), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_provider"),
    )
    op.create_index(
        op.f("ix_ai_provider_credentials_id"),
        "ai_provider_credentials",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_provider_credentials_user_id"),
        "ai_provider_credentials",
        ["user_id"],
        unique=False,
    )
    # Add optional ai_provider and model columns to prompt_systems for BYOK
    op.add_column(
        "prompt_systems",
        sa.Column("ai_provider", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "prompt_systems",
        sa.Column("model", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prompt_systems", "model")
    op.drop_column("prompt_systems", "ai_provider")
    op.drop_index(
        op.f("ix_ai_provider_credentials_user_id"),
        table_name="ai_provider_credentials",
    )
    op.drop_index(
        op.f("ix_ai_provider_credentials_id"),
        table_name="ai_provider_credentials",
    )
    op.drop_table("ai_provider_credentials")
