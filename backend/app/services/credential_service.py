"""BYOK Credential Service — manages encrypted AI provider API keys.

SECURITY CONTRACT:
- encrypt_api_key() called on every write; plain key never persisted.
- decrypt_api_key() called ONLY at LLM runtime, never in API responses.
- mask_api_key() used for all API responses.
- user_id always derived from authenticated token, never from request body.
- Cross-user access is prevented by always filtering on user_id.
"""
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.ai_provider_credential import AIProviderCredential, SUPPORTED_PROVIDERS
from ..schemas.ai_provider_credential import (
    PROVIDER_DISPLAY_NAMES,
    AIProviderCredentialResponse,
    TestConnectionResponse,
)
from ..utils.encryption import decrypt_api_key, encrypt_api_key, mask_api_key


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_response(cred: Optional[AIProviderCredential], provider: str) -> AIProviderCredentialResponse:
    """Build a safe response object for a given provider."""
    display_name = PROVIDER_DISPLAY_NAMES.get(provider, provider)
    if cred is None:
        return AIProviderCredentialResponse(
            provider=provider,
            provider_name=display_name,
            configured=False,
            masked_api_key=None,
            created_at=None,
            updated_at=None,
        )
    # Decrypt only to derive the mask — never returned to caller
    try:
        plain = decrypt_api_key(cred.encrypted_api_key)
        masked = mask_api_key(plain)
    except Exception:
        masked = "••••••••?????"

    return AIProviderCredentialResponse(
        provider=provider,
        provider_name=display_name,
        configured=True,
        masked_api_key=masked,
        created_at=cred.created_at,
        updated_at=cred.updated_at,
    )


async def _get_credential(
    db: AsyncSession, user_id: int, provider: str
) -> Optional[AIProviderCredential]:
    """Fetch a user's credential for a specific provider."""
    stmt = select(AIProviderCredential).where(
        AIProviderCredential.user_id == user_id,
        AIProviderCredential.provider == provider,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def list_credentials(
    db: AsyncSession, user_id: int
) -> List[AIProviderCredentialResponse]:
    """Return safe metadata for all four supported providers.

    Always returns exactly four entries (one per supported provider),
    with configured=False for providers without saved keys.
    """
    stmt = select(AIProviderCredential).where(
        AIProviderCredential.user_id == user_id
    )
    result = await db.execute(stmt)
    existing: dict[str, AIProviderCredential] = {
        c.provider: c for c in result.scalars().all()
    }
    return [
        _build_response(existing.get(p), p)
        for p in sorted(SUPPORTED_PROVIDERS)
    ]


async def upsert_credential(
    db: AsyncSession,
    user_id: int,
    provider: str,
    plain_api_key: str,
) -> AIProviderCredentialResponse:
    """Create or update a provider credential for the authenticated user.

    Encrypts the API key before storing.
    NEVER stores or logs the plain-text key.
    """
    # Validate provider
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported provider '{provider}'. Must be one of: {', '.join(sorted(SUPPORTED_PROVIDERS))}.",
        )

    # Encrypt the key — raises RuntimeError if CREDENTIAL_ENCRYPTION_KEY missing
    try:
        encrypted = encrypt_api_key(plain_api_key)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encrypt API key. Please contact your administrator.",
        ) from exc

    cred = await _get_credential(db, user_id, provider)
    if cred:
        cred.encrypted_api_key = encrypted
    else:
        cred = AIProviderCredential(
            user_id=user_id,
            provider=provider,
            encrypted_api_key=encrypted,
        )
        db.add(cred)

    await db.commit()
    await db.refresh(cred)
    return _build_response(cred, provider)


async def delete_credential(
    db: AsyncSession, user_id: int, provider: str
) -> bool:
    """Delete a provider credential for the authenticated user.

    Returns True if deleted, False if it didn't exist.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported provider '{provider}'.",
        )

    cred = await _get_credential(db, user_id, provider)
    if not cred:
        return False

    await db.delete(cred)
    await db.commit()
    return True


async def get_decrypted_api_key_for_runtime(
    db: AsyncSession, user_id: int, provider: str
) -> str:
    """Decrypt and return an API key for INTERNAL runtime use only.

    SECURITY: Call this ONLY inside the LLM execution path.
    NEVER return the result to any API response.
    NEVER log the result.

    Raises:
        HTTPException 404: If the user has no key for this provider.
        HTTPException 500: If decryption fails.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported provider '{provider}'.",
        )

    cred = await _get_credential(db, user_id, provider)
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No API key configured for provider '{provider}'. Please add your key in Settings → AI Providers.",
        )

    try:
        return decrypt_api_key(cred.encrypted_api_key)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt API key. Please re-save your key in Settings → AI Providers.",
        ) from exc


async def test_connection(
    db: AsyncSession, user_id: int, provider: str
) -> TestConnectionResponse:
    """Test connectivity for a provider using the user's stored key.

    Decrypts the key on the backend, makes a minimal provider request,
    and returns only success/failure. NEVER returns the key.
    """
    # Decrypt the key (raises if not found or decryption fails)
    try:
        plain_key = await get_decrypted_api_key_for_runtime(db, user_id, provider)
    except HTTPException as exc:
        return TestConnectionResponse(
            provider=provider,
            success=False,
            message=exc.detail or "Credential not found.",
        )

    # Make a minimal provider-specific request
    try:
        if provider == "openai":
            return await _test_openai(plain_key)
        elif provider == "anthropic":
            return await _test_anthropic(plain_key)
        elif provider == "gemini":
            return await _test_gemini(plain_key)
        elif provider == "groq":
            return await _test_groq(plain_key)
        else:
            return TestConnectionResponse(
                provider=provider,
                success=False,
                message="Unknown provider.",
            )
    except Exception:
        # Never expose provider secrets or stack traces
        return TestConnectionResponse(
            provider=provider,
            success=False,
            message=f"Connection to {PROVIDER_DISPLAY_NAMES.get(provider, provider)} failed. Please verify your API key.",
        )
    finally:
        # Explicitly delete plain_key from scope
        del plain_key


async def _test_openai(api_key: str) -> TestConnectionResponse:
    """Minimal OpenAI connectivity test using models list endpoint."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if resp.status_code == 200:
            return TestConnectionResponse(
                provider="openai", success=True, message="OpenAI connection successful."
            )
        elif resp.status_code == 401:
            return TestConnectionResponse(
                provider="openai", success=False, message="Invalid OpenAI API key."
            )
        else:
            return TestConnectionResponse(
                provider="openai",
                success=False,
                message="OpenAI returned an unexpected response. Please verify your key.",
            )
    except Exception:
        return TestConnectionResponse(
            provider="openai",
            success=False,
            message="Could not reach OpenAI. Check your network or API key.",
        )


async def _test_anthropic(api_key: str) -> TestConnectionResponse:
    """Minimal Anthropic connectivity test."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
        if resp.status_code in (200, 403):
            # 403 means the key is recognized but may lack model access; still valid
            return TestConnectionResponse(
                provider="anthropic", success=True, message="Anthropic connection successful."
            )
        elif resp.status_code == 401:
            return TestConnectionResponse(
                provider="anthropic", success=False, message="Invalid Anthropic API key."
            )
        else:
            return TestConnectionResponse(
                provider="anthropic",
                success=False,
                message="Anthropic returned an unexpected response. Please verify your key.",
            )
    except Exception:
        return TestConnectionResponse(
            provider="anthropic",
            success=False,
            message="Could not reach Anthropic. Check your network or API key.",
        )


async def _test_gemini(api_key: str) -> TestConnectionResponse:
    """Minimal Gemini connectivity test."""
    try:
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        if resp.status_code == 200:
            return TestConnectionResponse(
                provider="gemini", success=True, message="Google Gemini connection successful."
            )
        elif resp.status_code in (400, 403):
            return TestConnectionResponse(
                provider="gemini", success=False, message="Invalid Google Gemini API key."
            )
        else:
            return TestConnectionResponse(
                provider="gemini",
                success=False,
                message="Gemini returned an unexpected response. Please verify your key.",
            )
    except Exception:
        return TestConnectionResponse(
            provider="gemini",
            success=False,
            message="Could not reach Google Gemini. Check your network or API key.",
        )


async def _test_groq(api_key: str) -> TestConnectionResponse:
    """Minimal Groq connectivity test."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if resp.status_code == 200:
            return TestConnectionResponse(
                provider="groq", success=True, message="Groq connection successful."
            )
        elif resp.status_code == 401:
            return TestConnectionResponse(
                provider="groq", success=False, message="Invalid Groq API key."
            )
        else:
            return TestConnectionResponse(
                provider="groq",
                success=False,
                message="Groq returned an unexpected response. Please verify your key.",
            )
    except Exception:
        return TestConnectionResponse(
            provider="groq",
            success=False,
            message="Could not reach Groq. Check your network or API key.",
        )
