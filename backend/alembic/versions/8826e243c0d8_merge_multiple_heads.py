"""Merge multiple heads

Revision ID: 8826e243c0d8
Revises: 008_create_run_history_table, 009_create_conversation_tables
Create Date: 2026-10-01 19:15:37.853158

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8826e243c0d8'
down_revision: Union[str, Sequence[str], None] = ('008_create_run_history_table', '009_create_conversation_tables')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
