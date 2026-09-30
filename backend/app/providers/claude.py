"""Claude Provider implementation for PromptForge."""
from typing import Dict
from .base import BaseProvider


class ClaudeProvider(BaseProvider):
    """Claude destination provider."""

    id: str = "claude"
    name: str = "Claude"
    url: str = "https://claude.ai/"
    capabilities: Dict[str, bool] = {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }
