"""create test_cases table

Revision ID: 006_create_test_cases_table
Revises: 005_create_module_refs_table
Create Date: 2026-09-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '006_create_test_cases_table'
down_revision: Union[str, Sequence[str], None] = '005_create_module_refs_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'test_cases',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('prompt_system_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column(
            'variables',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
        sa.Column(
            'expected_behavior',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['prompt_system_id'], ['prompt_systems.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_test_cases_id'), 'test_cases', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_test_cases_prompt_system_id'),
        'test_cases', ['prompt_system_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_test_cases_prompt_system_id'), table_name='test_cases')
    op.drop_index(op.f('ix_test_cases_id'), table_name='test_cases')
    op.drop_table('test_cases')
