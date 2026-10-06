"""add variables to conversations

Revision ID: 013_add_vars_to_conversations
Revises: 012_add_conv_id_to_documents
Create Date: 2026-10-05 14:33:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '013_add_vars_to_conversations'
down_revision = '012_add_conv_id_to_documents'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('conversations', sa.Column('variables', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

def downgrade() -> None:
    op.drop_column('conversations', 'variables')
