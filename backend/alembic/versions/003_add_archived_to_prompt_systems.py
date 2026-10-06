"""add archived to prompt_systems

Revision ID: 003_add_archived_prompt_systems
Revises: 002_create_prompt_systems_table
Create Date: 2026-09-24 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_add_archived_prompt_systems'
down_revision: Union[str, Sequence[str], None] = '002_create_prompt_systems_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'prompt_systems',
        sa.Column('archived', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    op.create_index(op.f('ix_prompt_systems_archived'), 'prompt_systems', ['archived'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_prompt_systems_archived'), table_name='prompt_systems')
    op.drop_column('prompt_systems', 'archived')
