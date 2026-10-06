"""create module_references table

Revision ID: 005_create_module_refs_table
Revises: 004_create_prompt_modules_table
Create Date: 2026-09-25 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '005_create_module_refs_table'
down_revision: Union[str, Sequence[str], None] = '004_create_prompt_modules_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'module_references',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('prompt_system_id', sa.Integer(), nullable=False),
        sa.Column('module_id', sa.Integer(), nullable=False),
        sa.Column(
            'input_mapping',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
        sa.Column(
            'output_mapping',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
        sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['prompt_system_id'], ['prompt_systems.id'], ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['module_id'], ['prompt_modules.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'prompt_system_id', 'module_id',
            name='uq_module_reference_system_module'
        ),
    )
    op.create_index(
        op.f('ix_module_references_id'), 'module_references', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_module_references_prompt_system_id'),
        'module_references', ['prompt_system_id'], unique=False
    )
    op.create_index(
        op.f('ix_module_references_module_id'),
        'module_references', ['module_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_module_references_module_id'), table_name='module_references')
    op.drop_index(op.f('ix_module_references_prompt_system_id'), table_name='module_references')
    op.drop_index(op.f('ix_module_references_id'), table_name='module_references')
    op.drop_table('module_references')
