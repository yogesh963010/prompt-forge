"""Gemini Provider implementation for PromptForge."""
from typing import Dict
from .base import BaseProvider


class GeminiProvider(BaseProvider):
    """Gemini destination provider."""

    id: str = "gemini"
    name: str = "Gemini"
    url: str = "https://gemini.google.com/"
    capabilities: Dict[str, bool] = {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }
