"""add share fields to conversations

Revision ID: 014_add_share_to_conversations
Revises: 013_add_vars_to_conversations
Create Date: 2026-10-05 23:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '014_add_share_to_conversations'
down_revision = '013_add_vars_to_conversations'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'conversations',
        sa.Column('visibility', sa.String(length=20), server_default='private', nullable=False)
    )
    op.add_column(
        'conversations',
        sa.Column('share_token', sa.String(length=64), nullable=True)
    )
    op.create_index(
        op.f('ix_conversations_share_token'),
        'conversations',
        ['share_token'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_conversations_share_token'), table_name='conversations')
    op.drop_column('conversations', 'share_token')
    op.drop_column('conversations', 'visibility')
