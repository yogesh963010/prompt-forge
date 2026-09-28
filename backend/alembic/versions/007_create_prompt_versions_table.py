"""create prompt_versions table

Revision ID: 007_create_prompt_versions_table
Revises: 006_create_test_cases_table
Create Date: 2026-09-28 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '007_create_prompt_versions_table'
down_revision: Union[str, Sequence[str], None] = '006_create_test_cases_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'prompt_versions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('prompt_system_id', sa.Integer(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column(
            'configuration_snapshot',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=False,
        ),
        sa.Column('change_note', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ['prompt_system_id'], ['prompt_systems.id'], ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['created_by'], ['users.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_prompt_versions_id'), 'prompt_versions', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_prompt_versions_prompt_system_id'),
        'prompt_versions', ['prompt_system_id'], unique=False
    )
    op.create_index(
        op.f('ix_prompt_versions_version_number'),
        'prompt_versions', ['version_number'], unique=False
    )
    op.create_index(
        op.f('ix_prompt_versions_created_by'),
        'prompt_versions', ['created_by'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_prompt_versions_created_by'), table_name='prompt_versions')
    op.drop_index(op.f('ix_prompt_versions_version_number'), table_name='prompt_versions')
    op.drop_index(op.f('ix_prompt_versions_prompt_system_id'), table_name='prompt_versions')
    op.drop_index(op.f('ix_prompt_versions_id'), table_name='prompt_versions')
    op.drop_table('prompt_versions')
