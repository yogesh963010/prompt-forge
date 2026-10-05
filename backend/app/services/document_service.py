"""Service for managing uploaded PDF documents with multi-tenant storage isolation."""
import os
import re
import uuid
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.document import Document
from ..models.prompt_system import PromptSystem
from ..models.prompt_module import PromptModule
from ..models.module_reference import ModuleReference

logger = logging.getLogger(__name__)

# Base storage path for uploaded documents
_backend_dir = Path(__file__).resolve().parent.parent.parent
_env_documents = os.getenv("STORAGE_DOCUMENTS_DIR")
if _env_documents:
    _d_path = Path(_env_documents)
    BASE_STORAGE_DIR = (_backend_dir / _d_path).resolve() if not _d_path.is_absolute() else _d_path.resolve()
else:
    BASE_STORAGE_DIR = (_backend_dir / "storage" / "documents").resolve()

MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_DOCUMENT_SIZE_MB", "10")) * 1024 * 1024


def sanitize_filename(filename: str) -> str:
    """Sanitize original filename to prevent path traversal and shell injection."""
    # Strip directory components
    clean_name = os.path.basename(filename)
    # Remove leading dots to prevent hidden files
    clean_name = clean_name.lstrip(".")
    # Replace any character that is not alphanumeric, underscore, dash, or dot
    clean_name = re.sub(r"[^a-zA-Z0-9_\.-]", "_", clean_name)
    if not clean_name:
        clean_name = "document.pdf"
    if not clean_name.lower().endswith(".pdf"):
        clean_name += ".pdf"
    return clean_name


class DocumentService:
    """Document service handling file validation, storage isolation, and database metadata."""

    def __init__(self, base_storage_dir: Path = BASE_STORAGE_DIR):
        self.base_dir = base_storage_dir

    def get_storage_directory(
        self, user_id: int, prompt_system_id: int, module_id: Optional[int] = None
    ) -> Path:
        """Resolve isolated storage directory for a user, prompt system, and optional module."""
        user_dir = f"user_{user_id}"
        system_dir = f"prompt_system_{prompt_system_id}"
        scope_dir = f"module_{module_id}" if module_id is not None else "parent"

        target_dir = (self.base_dir / user_dir / system_dir / scope_dir).resolve()

        # Strict security check: ensure target_dir is strictly inside self.base_dir
        if not str(target_dir).startswith(str(self.base_dir)):
            raise ValueError("Invalid storage path traversal detected.")

        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir

    async def validate_scope(
        self,
        db: AsyncSession,
        user_id: int,
        prompt_system_id: int,
        module_id: Optional[int] = None,
    ) -> None:
        """Verify prompt system ownership and module relationship."""
        # 1. Check Prompt System ownership
        stmt = select(PromptSystem).where(
            PromptSystem.id == prompt_system_id,
            PromptSystem.owner_id == user_id,
        )
        system = (await db.execute(stmt)).scalar_one_or_none()
        if not system:
            raise ValueError("Prompt System not found or not owned by user.")

        # 2. Check Module if provided
        if module_id is not None:
            # Check module existence & ownership
            mod_stmt = select(PromptModule).where(
                PromptModule.id == module_id,
                PromptModule.owner_id == user_id,
            )
            module = (await db.execute(mod_stmt)).scalar_one_or_none()
            if not module:
                raise ValueError("Child Assistant (Module) not found or not owned by user.")

            # Check attachment to Prompt System
            ref_stmt = select(ModuleReference).where(
                ModuleReference.prompt_system_id == prompt_system_id,
                ModuleReference.module_id == module_id,
            )
            ref = (await db.execute(ref_stmt)).scalar_one_or_none()
            if not ref:
                raise ValueError("Child Assistant does not belong to the given Prompt System.")

    async def validate_pdf_content(self, file: UploadFile) -> bytes:
        """Validate PDF format, extension, content type, magic bytes, and size."""
        # Validate filename extension
        original_name = file.filename or ""
        if not original_name.lower().endswith(".pdf"):
            raise ValueError("Invalid file format. Only PDF files (.pdf) are allowed.")

        # Read content
        content = await file.read()
        file_size = len(content)

        if file_size == 0:
            raise ValueError("Uploaded file is empty.")

        if file_size > MAX_FILE_SIZE_BYTES:
            max_mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
            raise ValueError(f"File size exceeds maximum limit of {max_mb}MB.")

        # Validate magic bytes: PDF files begin with '%PDF-'
        if not content.startswith(b"%PDF-"):
            raise ValueError("Invalid PDF file. The file content does not have a valid PDF header.")

        # Validate content_type if provided
        if file.content_type and "pdf" not in file.content_type.lower():
            raise ValueError("Invalid content type. Only application/pdf is accepted.")

        return content

    async def upload_document(
        self,
        db: AsyncSession,
        user_id: int,
        prompt_system_id: int,
        file: UploadFile,
        module_id: Optional[int] = None,
        conversation_id: Optional[int] = None,
        railway_document_id: Optional[str] = None,
    ) -> Document:
        """Validate, store PDF locally in isolated path, and persist metadata."""
        # 1. Validate ownership & relations
        await self.validate_scope(db, user_id, prompt_system_id, module_id)

        # 2. Validate PDF file
        file_bytes = await self.validate_pdf_content(file)
        file_size = len(file_bytes)

        # 3. Prepare storage
        clean_filename = sanitize_filename(file.filename or "document.pdf")
        doc_uuid = str(uuid.uuid4())
        stored_filename = f"{doc_uuid}_{clean_filename}"
        storage_dir = self.get_storage_directory(user_id, prompt_system_id, module_id)
        file_path = (storage_dir / stored_filename).resolve()

        # Extra path traversal verification
        if not str(file_path).startswith(str(storage_dir)):
            raise ValueError("Invalid file path traversal detected.")

        # 4. Write physical file
        try:
            with open(file_path, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            logger.error(f"Failed to write file to storage: {e}")
            raise RuntimeError("Failed to store file on disk.")

        # 5. Insert metadata into database
        document = Document(
            id=doc_uuid,
            user_id=user_id,
            prompt_system_id=prompt_system_id,
            module_id=module_id,
            conversation_id=conversation_id,
            filename=file.filename or clean_filename,
            stored_filename=stored_filename,
            file_path=str(file_path),
            file_size=file_size,
            content_type="application/pdf",
            railway_document_id=railway_document_id,
        )

        try:
            db.add(document)
            await db.commit()
            await db.refresh(document)

            # Trigger integrated local RAG indexing for this document
            try:
                from ..rag.vectorstore import index_document_file
                await index_document_file(
                    file_path=str(file_path),
                    user_id=user_id,
                    prompt_system_id=prompt_system_id,
                    module_id=module_id,
                    document_id=doc_uuid,
                    filename=document.filename,
                )
            except Exception as rag_err:
                logger.warning(f"RAG indexing warning for document {doc_uuid}: {rag_err}")

            return document
        except Exception as db_err:
            logger.error(f"Database insertion failed for document {doc_uuid}: {db_err}")
            await db.rollback()
            # Clean up the created physical file to avoid orphan files
            try:
                if file_path.exists():
                    file_path.unlink()
            except OSError as cleanup_err:
                logger.error(f"Failed to clean up orphan file {file_path}: {cleanup_err}")
            raise RuntimeError(f"Database error while saving document metadata: {str(db_err)}")

    async def list_documents(
        self,
        db: AsyncSession,
        user_id: int,
        prompt_system_id: Optional[int] = None,
        module_id: Optional[int] = None,
        conversation_id: Optional[int] = None,
        parent_only: Optional[bool] = None,
        include_all_modules: bool = False,
    ) -> List[Document]:
        """List documents owned by the authenticated user with strict scope isolation."""
        query = select(Document).where(Document.user_id == user_id)

        if prompt_system_id is not None:
            query = query.where(Document.prompt_system_id == prompt_system_id)
            if module_id is not None:
                query = query.where(Document.module_id == module_id)
            elif parent_only is True or not include_all_modules:
                # Per spec Section 6: GET /documents?prompt_system_id=10 must return only module_id IS NULL
                query = query.where(Document.module_id.is_(None))
        elif module_id is not None:
            query = query.where(Document.module_id == module_id)
        elif parent_only is True:
            query = query.where(Document.module_id.is_(None))
            
        if conversation_id is not None:
            query = query.where(Document.conversation_id == conversation_id)
        else:
            query = query.where(Document.conversation_id.is_(None))

        query = query.order_by(Document.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_scoped_document_context(
        self,
        db: AsyncSession,
        user_id: int,
        prompt_system_id: int,
        module_id: Optional[int] = None,
        conversation_id: Optional[int] = None,
        max_chars_per_doc: int = 4000,
    ) -> dict:
        """Extract and format text context from scoped documents for LLM chatbot grounding."""
        # 1. Validate scope ownership
        await self.validate_scope(db, user_id, prompt_system_id, module_id)

        # 2. Query scoped documents
        docs = await self.list_documents(
            db=db,
            user_id=user_id,
            prompt_system_id=prompt_system_id,
            module_id=module_id,
            conversation_id=conversation_id,
            include_all_modules=False,
        )

        extracted_docs = []
        context_parts = []

        for doc in docs:
            text_content = ""
            try:
                file_path = Path(doc.file_path)
                if file_path.exists():
                    from pypdf import PdfReader
                    reader = PdfReader(str(file_path))
                    pages_text = []
                    for page in reader.pages:
                        t = page.extract_text()
                        if t:
                            pages_text.append(t)
                    text_content = "\n".join(pages_text).strip()
            except Exception as e:
                logger.warning(f"Failed to extract text from {doc.file_path}: {e}")

            if text_content:
                truncated_text = text_content[:max_chars_per_doc]
                extracted_docs.append({
                    "id": doc.id,
                    "filename": doc.filename,
                    "content": truncated_text,
                })
                scope_label = f"Child Module {module_id}" if module_id is not None else "Parent Assistant"
                context_parts.append(
                    f"--- DOCUMENT: {doc.filename} (Scope: {scope_label}) ---\n{truncated_text}"
                )

        full_context = "\n\n".join(context_parts)
        return {
            "documents": extracted_docs,
            "context_text": full_context,
            "count": len(extracted_docs),
        }

    async def get_document(
        self, db: AsyncSession, user_id: int, document_id: str
    ) -> Optional[Document]:
        """Retrieve a single document metadata record owned by authenticated user."""
        stmt = select(Document).where(
            Document.id == document_id,
            Document.user_id == user_id,
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    async def delete_document(
        self, db: AsyncSession, user_id: int, document_id: str
    ) -> bool:
        """Delete physical PDF file and database metadata if owned by authenticated user."""
        document = await self.get_document(db, user_id, document_id)
        if not document:
            return False

        # Delete physical file
        try:
            target_path = Path(document.file_path)
            if target_path.exists():
                target_path.unlink()
        except OSError as e:
            logger.warning(
                f"Physical file deletion failed for document {document_id} at {document.file_path}: {e}"
            )

        # Remove from integrated local RAG vector store
        try:
            from ..rag.vectorstore import delete_document_index
            delete_document_index(
                user_id=user_id,
                prompt_system_id=document.prompt_system_id,
                module_id=document.module_id,
                document_id=document_id,
            )
        except Exception as rag_err:
            logger.warning(f"RAG index deletion warning for {document_id}: {rag_err}")

        # Delete from DB
        await db.delete(document)
        await db.commit()
        return True


document_service = DocumentService()
