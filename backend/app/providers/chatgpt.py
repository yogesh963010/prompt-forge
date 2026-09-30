"""ChatGPT Provider implementation for PromptForge."""
from typing import Dict
from .base import BaseProvider


class ChatGPTProvider(BaseProvider):
    """ChatGPT destination provider."""

    id: str = "chatgpt"
    name: str = "ChatGPT"
    url: str = "https://chatgpt.com/"
    capabilities: Dict[str, bool] = {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }
