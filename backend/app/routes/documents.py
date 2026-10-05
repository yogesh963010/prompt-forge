"""Routes for PDF document upload, listing, retrieval, and deletion with ownership isolation."""
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.document import DocumentResponse, DocumentContextResponse
from ..services.document_service import document_service

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload PDF document with isolated ownership",
)
async def upload_document(
    file: UploadFile = File(..., description="PDF file to upload"),
    prompt_system_id: int = Form(..., description="Prompt System ID owning the document"),
    module_id: Optional[int] = Form(None, description="Optional Child Assistant Module ID"),
    conversation_id: Optional[int] = Form(None, description="Optional Conversation ID"),
    railway_document_id: Optional[str] = Form(None, description="Optional Railway Document ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF file and link it to the authenticated user, Prompt System, and optional Module/Conversation."""
    try:
        doc = await document_service.upload_document(
            db=db,
            user_id=current_user.id,
            prompt_system_id=prompt_system_id,
            file=file,
            module_id=module_id,
            conversation_id=conversation_id,
            railway_document_id=railway_document_id,
        )
        return doc
    except ValueError as ve:
        err_msg = str(ve)
        if "not found" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
    except RuntimeError as re:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(re)
        )


@router.get(
    "",
    response_model=List[DocumentResponse],
    summary="List documents owned by current authenticated user",
)
async def list_documents(
    prompt_system_id: Optional[int] = Query(None, description="Filter by Prompt System ID"),
    module_id: Optional[int] = Query(None, description="Filter by Child Module ID"),
    conversation_id: Optional[int] = Query(None, description="Filter by Conversation ID"),
    parent_only: Optional[bool] = Query(None, description="Filter documents belonging only to parent (module_id is null)"),
    include_all_modules: bool = Query(False, description="Include all modules for prompt system"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all documents owned by current authenticated user with optional scope filters."""
    return await document_service.list_documents(
        db=db,
        user_id=current_user.id,
        prompt_system_id=prompt_system_id,
        module_id=module_id,
        conversation_id=conversation_id,
        parent_only=parent_only,
        include_all_modules=include_all_modules,
    )


@router.get(
    "/context",
    response_model=DocumentContextResponse,
    summary="Get extracted text context from scoped documents for LLM chatbot grounding",
)
async def get_document_context(
    prompt_system_id: int = Query(..., description="Prompt System ID"),
    module_id: Optional[int] = Query(None, description="Optional Child Assistant Module ID"),
    conversation_id: Optional[int] = Query(None, description="Optional Conversation ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve extracted text from authorized documents in current assistant scope."""
    try:
        return await document_service.get_scoped_document_context(
            db=db,
            user_id=current_user.id,
            prompt_system_id=prompt_system_id,
            module_id=module_id,
            conversation_id=conversation_id,
        )
    except ValueError as ve:
        err_msg = str(ve)
        if "not found" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document metadata by ID",
)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve document metadata only if owned by the authenticated user."""
    doc = await document_service.get_document(db, current_user.id, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return doc


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete document and physical file",
)
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete document and physical file only if owned by authenticated user."""
    success = await document_service.delete_document(db, current_user.id, document_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return None


@router.get(
    "/{document_id}/download",
    summary="Download physical PDF file with ownership check",
)
async def download_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Securely stream uploaded PDF to authenticated owner only."""
    doc = await document_service.get_document(db, current_user.id, document_id)
    if not doc or not os.path.exists(doc.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found.",
        )

    return FileResponse(
        path=doc.file_path,
        filename=doc.filename,
        media_type="application/pdf",
    )
