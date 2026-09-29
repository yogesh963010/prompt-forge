"""Groq Provider implementation for PromptForge."""
from typing import Dict
from .base import BaseProvider


class GroqProvider(BaseProvider):
    """Groq destination provider."""

    id: str = "groq"
    name: str = "Groq"
    url: str = "https://groq.com/"
    capabilities: Dict[str, bool] = {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }
