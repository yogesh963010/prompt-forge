"""add railway_document_id to documents

Revision ID: 011_add_railway_document_id
Revises: 010_create_documents_table
Create Date: 2026-10-04 12:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '011_add_railway_document_id'
down_revision = '010_create_documents_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column('railway_document_id', sa.String(length=255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('documents', 'railway_document_id')
