"""Base AI Provider abstraction for PromptForge."""
from abc import ABC
from typing import Any, Dict


class BaseProvider(ABC):
    """Abstract base provider ensuring consistent interface across all AI providers."""

    id: str
    name: str
    url: str
    capabilities: Dict[str, bool] = {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }

    def get_metadata(self) -> Dict[str, Any]:
        """Return provider metadata and capabilities."""
        return {
            "id": self.id,
            "name": self.name,
            "capabilities": dict(self.capabilities),
        }

    def action(self, resolved_prompt: str) -> Dict[str, Any]:
        """Execute the MVP destination action: copy resolved prompt and prepare destination.

        Does not perform browser automation or make direct LLM calls.
        Guarantees that resolved_prompt is received and forwarded unchanged.
        """
        return {
            "provider_id": self.id,
            "provider_name": self.name,
            "url": self.url,
            "resolved_prompt": resolved_prompt,
            "action": "open",
            "copy_prompt": self.capabilities.get("copy_prompt", True),
        }

    def run(self, prompt: str) -> Any:
        """Placeholder for future direct API execution (Branch 18+)."""
        raise NotImplementedError(
            f"Direct execution is not supported by {self.name} for this MVP."
        )
