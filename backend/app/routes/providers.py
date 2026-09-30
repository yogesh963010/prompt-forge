"""AI Providers API route handlers."""
from typing import List
from fastapi import APIRouter, HTTPException, status

from ..providers import get_provider, list_providers
from ..schemas.provider import (
    ProviderActionRequest,
    ProviderActionResponse,
    ProviderResponse,
)

router = APIRouter(
    prefix="/providers",
    tags=["AI Providers"],
)


@router.get(
    "",
    response_model=List[ProviderResponse],
    status_code=status.HTTP_200_OK,
    summary="List supported AI Providers",
    description="Returns metadata and capabilities for all registered AI providers.",
)
async def get_providers() -> List[ProviderResponse]:
    """Retrieve all available AI providers from registry."""
    providers = list_providers()
    return [
        ProviderResponse(
            id=p.id,
            name=p.name,
            capabilities=p.capabilities,
        )
        for p in providers
    ]


@router.get(
    "/{provider_id}",
    response_model=ProviderResponse,
    status_code=status.HTTP_200_OK,
    summary="Get AI Provider metadata",
    description="Returns metadata and capabilities for a specific registered provider.",
)
async def get_single_provider(provider_id: str) -> ProviderResponse:
    """Retrieve provider metadata by ID."""
    provider = get_provider(provider_id)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider '{provider_id}' not found.",
        )
    return ProviderResponse(
        id=provider.id,
        name=provider.name,
        capabilities=provider.capabilities,
    )


@router.post(
    "/{provider_id}/action",
    response_model=ProviderActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute provider destination action",
    description="Prepares destination action (copy prompt and destination URL) without executing external LLM APIs.",
)
async def execute_provider_action(
    provider_id: str,
    payload: ProviderActionRequest,
) -> ProviderActionResponse:
    """Execute destination action for a registered AI provider."""
    # Ensure arbitrary URLs or unregistered IDs are strictly rejected
    provider = get_provider(provider_id)
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider '{provider_id}' is not supported.",
        )

    # Provider action receives the resolved prompt unchanged
    result = provider.action(payload.resolved_prompt)
    return ProviderActionResponse(**result)
