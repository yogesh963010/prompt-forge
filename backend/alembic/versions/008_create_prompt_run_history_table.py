"""create prompt_run_history table

Revision ID: 008_create_run_history_table
Revises: 4bd029ef8df2
Create Date: 2026-09-30 14:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '008_create_run_history_table'
down_revision: Union[str, Sequence[str], None] = '4bd029ef8df2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'prompt_run_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('prompt_system_id', sa.Integer(), nullable=True),
        sa.Column('module_id', sa.Integer(), nullable=True),
        sa.Column('prompt_system_name', sa.String(length=255), nullable=False),
        sa.Column('module_name', sa.String(length=255), nullable=True),
        sa.Column('final_prompt', sa.Text(), nullable=False),
        sa.Column(
            'runtime_variables',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['prompt_system_id'], ['prompt_systems.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['module_id'], ['prompt_modules.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_prompt_run_history_id'), 'prompt_run_history', ['id'], unique=False)
    op.create_index(op.f('ix_prompt_run_history_user_id'), 'prompt_run_history', ['user_id'], unique=False)
    op.create_index(op.f('ix_prompt_run_history_prompt_system_id'), 'prompt_run_history', ['prompt_system_id'], unique=False)
    op.create_index(op.f('ix_prompt_run_history_module_id'), 'prompt_run_history', ['module_id'], unique=False)
    op.create_index(op.f('ix_prompt_run_history_created_at'), 'prompt_run_history', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_prompt_run_history_created_at'), table_name='prompt_run_history')
    op.drop_index(op.f('ix_prompt_run_history_module_id'), table_name='prompt_run_history')
    op.drop_index(op.f('ix_prompt_run_history_prompt_system_id'), table_name='prompt_run_history')
    op.drop_index(op.f('ix_prompt_run_history_user_id'), table_name='prompt_run_history')
    op.drop_index(op.f('ix_prompt_run_history_id'), table_name='prompt_run_history')
    op.drop_table('prompt_run_history')
