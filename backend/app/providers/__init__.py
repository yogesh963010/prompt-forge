"""AI Provider registry and abstractions for PromptForge."""
from typing import Dict, List, Optional

from .base import BaseProvider
from .chatgpt import ChatGPTProvider
from .claude import ClaudeProvider
from .groq import GroqProvider
from .gemini import GeminiProvider

PROVIDERS: Dict[str, BaseProvider] = {
    "chatgpt": ChatGPTProvider(),
    "claude": ClaudeProvider(),
    "groq": GroqProvider(),
    "gemini": GeminiProvider(),
}


def get_provider(provider_id: str) -> Optional[BaseProvider]:
    """Retrieve provider instance by ID from registry."""
    if not provider_id or not isinstance(provider_id, str):
        return None
    return PROVIDERS.get(provider_id.lower().strip())


def list_providers() -> List[BaseProvider]:
    """Return all registered providers in deterministic order."""
    return list(PROVIDERS.values())


__all__ = [
    "BaseProvider",
    "ChatGPTProvider",
    "ClaudeProvider",
    "GroqProvider",
    "GeminiProvider",
    "PROVIDERS",
    "get_provider",
    "list_providers",
]
