"""add sharing fields to prompt_system

Revision ID: 4bd029ef8df2
Revises: 007_create_prompt_versions_table
Create Date: 2026-09-30 12:26:45.968503

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4bd029ef8df2'
down_revision: Union[str, Sequence[str], None] = '007_create_prompt_versions_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('prompt_systems', sa.Column('visibility', sa.String(length=20), nullable=False, server_default='private'))
    op.add_column('prompt_systems', sa.Column('share_token', sa.String(length=64), nullable=True, unique=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('prompt_systems', 'share_token')
    op.drop_column('prompt_systems', 'visibility')
