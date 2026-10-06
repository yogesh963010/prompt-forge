"""BYOK (Bring Your Own Key) AI Provider Credentials API routes.

Routes:
    GET    /ai-providers               — list all 4 providers with config status
    POST   /ai-providers               — create/update a provider credential
    PUT    /ai-providers/{provider}    — update a specific provider credential
    DELETE /ai-providers/{provider}    — delete a provider credential
    POST   /ai-providers/{provider}/test — test connectivity

SECURITY:
- All routes require authenticated user (JWT Bearer).
- user_id is always derived from the JWT token, never from request body.
- Responses NEVER contain plain-text or decrypted API keys.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.ai_provider_credential import (
    AIProviderCredentialListResponse,
    AIProviderCredentialResponse,
    AIProviderCredentialUpsert,
    TestConnectionResponse,
    SUPPORTED_PROVIDERS,
)
from ..services.credential_service import (
    delete_credential,
    list_credentials,
    test_connection,
    upsert_credential,
)

router = APIRouter(
    prefix="/ai-providers",
    tags=["AI Provider Credentials (BYOK)"],
)


@router.get(
    "",
    response_model=AIProviderCredentialListResponse,
    status_code=status.HTTP_200_OK,
    summary="List AI provider credential status",
    description=(
        "Returns configuration status (configured/not configured) and masked API key "
        "for all supported providers. Never returns plain-text keys."
    ),
)
async def get_credentials(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialListResponse:
    """Get all provider credential statuses for the authenticated user."""
    credentials = await list_credentials(db, current_user.id)
    return AIProviderCredentialListResponse(credentials=credentials)


@router.post(
    "",
    response_model=AIProviderCredentialResponse,
    status_code=status.HTTP_200_OK,
    summary="Save AI provider credential",
    description=(
        "Create or update an encrypted API key for a supported provider. "
        "The plain-text key is encrypted immediately and never stored or returned."
    ),
)
async def save_credential(
    payload: AIProviderCredentialUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialResponse:
    """Save (upsert) an API key for the authenticated user."""
    return await upsert_credential(
        db=db,
        user_id=current_user.id,
        provider=payload.provider,
        plain_api_key=payload.api_key,
    )


@router.put(
    "/{provider}",
    response_model=AIProviderCredentialResponse,
    status_code=status.HTTP_200_OK,
    summary="Update AI provider credential",
    description="Update the encrypted API key for a specific provider.",
)
async def update_credential(
    provider: str,
    payload: AIProviderCredentialUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialResponse:
    """Update an API key for a specific provider."""
    # Ensure path param and body agree on the provider
    if payload.provider != provider.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provider in URL and body must match.",
        )
    return await upsert_credential(
        db=db,
        user_id=current_user.id,
        provider=payload.provider,
        plain_api_key=payload.api_key,
    )


@router.delete(
    "/{provider}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete AI provider credential",
    description="Permanently delete the stored API key for a specific provider.",
)
async def remove_credential(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a provider credential for the authenticated user."""
    normalized = provider.strip().lower()
    if normalized not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported provider '{provider}'.",
        )
    deleted = await delete_credential(db, current_user.id, normalized)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No credential found for provider '{normalized}'.",
        )


@router.post(
    "/{provider}/test",
    response_model=TestConnectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Test AI provider connection",
    description=(
        "Decrypts the stored key on the backend and makes a minimal provider request. "
        "Returns only success/failure. Never returns the API key."
    ),
)
async def test_provider_connection(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TestConnectionResponse:
    """Test a provider's API key connectivity for the authenticated user."""
    normalized = provider.strip().lower()
    if normalized not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported provider '{provider}'.",
        )
    return await test_connection(db, current_user.id, normalized)
