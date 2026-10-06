"""API key encryption/decryption utility for BYOK (Bring Your Own Key).

Uses Fernet symmetric encryption from the `cryptography` package.
The master key MUST be set via the CREDENTIAL_ENCRYPTION_KEY environment variable.

SECURITY RULES:
- Never hardcode the master key.
- Never log or print decrypted keys.
- Never return decrypted keys through any API endpoint.
- Never store the master key in the database.
"""
import base64
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

# Load .env
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()


def _get_fernet() -> Fernet:
    """Build a Fernet instance from the environment encryption key.

    Raises:
        RuntimeError: If CREDENTIAL_ENCRYPTION_KEY is missing or invalid.
    """
    raw_key = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "").strip()
    if not raw_key:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY environment variable is not configured. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    # Accept both raw-bytes-as-base64 (Fernet native) and plain strings
    try:
        # Fernet expects a URL-safe base64-encoded 32-byte key
        key_bytes = raw_key.encode() if isinstance(raw_key, str) else raw_key
        return Fernet(key_bytes)
    except Exception as exc:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY is not a valid Fernet key. "
            "Generate a valid key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        ) from exc


def encrypt_api_key(plain_key: str) -> str:
    """Encrypt a plain-text API key and return the encrypted token as a string.

    Args:
        plain_key: The raw API key provided by the user.

    Returns:
        URL-safe base64-encoded Fernet token (safe to store in DB).

    Raises:
        RuntimeError: If encryption key is missing or invalid.
        ValueError: If plain_key is empty.
    """
    if not plain_key or not plain_key.strip():
        raise ValueError("API key cannot be empty.")
    fernet = _get_fernet()
    token = fernet.encrypt(plain_key.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_api_key(encrypted_token: str) -> str:
    """Decrypt an encrypted API key token back to plain text.

    This MUST only be called on the backend at LLM call time.
    NEVER return the result to the frontend.

    Args:
        encrypted_token: The stored encrypted token string.

    Returns:
        The original plain-text API key.

    Raises:
        RuntimeError: If encryption key is missing or invalid.
        ValueError: If the token is invalid or tampered.
    """
    if not encrypted_token or not encrypted_token.strip():
        raise ValueError("Encrypted token cannot be empty.")
    fernet = _get_fernet()
    try:
        plain = fernet.decrypt(encrypted_token.encode("utf-8"))
        return plain.decode("utf-8")
    except InvalidToken as exc:
        # Do NOT log the token value — it may leak info about the key
        raise ValueError(
            "Failed to decrypt API key. The encryption key may have changed or the token is corrupted."
        ) from exc


def mask_api_key(plain_key: str, visible_chars: int = 4) -> str:
    """Return a masked representation of an API key for safe display.

    Example: 'sk-abcdefgh1234' → '••••••••1234'

    Args:
        plain_key: The original plain-text API key.
        visible_chars: Number of trailing characters to show.

    Returns:
        Masked string safe to return in API responses.
    """
    if not plain_key:
        return "••••••••"
    suffix = plain_key[-visible_chars:] if len(plain_key) >= visible_chars else plain_key
    return f"{'•' * 8}{suffix}"
