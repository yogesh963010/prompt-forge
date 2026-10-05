"""add conversation_id to documents

Revision ID: 012_add_conversation_id_to_documents
Revises: 011_add_railway_document_id
Create Date: 2026-10-05 13:58:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '012_add_conversation_id_to_documents'
down_revision = '011_add_railway_document_id'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('documents', sa.Column('conversation_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_documents_conversation_id_conversations', 'documents', 'conversations', ['conversation_id'], ['id'], ondelete='CASCADE')
    op.create_index(op.f('ix_documents_conversation_id'), 'documents', ['conversation_id'], unique=False)

def downgrade() -> None:
    op.drop_index(op.f('ix_documents_conversation_id'), table_name='documents')
    op.drop_constraint('fk_documents_conversation_id_conversations', 'documents', type_='foreignkey')
    op.drop_column('documents', 'conversation_id')
