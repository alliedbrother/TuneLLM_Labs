"""Security utility functions."""

import hashlib
import secrets
from typing import Tuple


def generate_api_key() -> Tuple[str, str]:
    """
    Generate an API key and its hash.

    Returns:
        Tuple of (plain_key, hashed_key)
    """
    plain_key = secrets.token_urlsafe(32)
    hashed_key = hash_api_key(plain_key)
    return plain_key, hashed_key


def hash_api_key(api_key: str) -> str:
    """Hash an API key for storage."""
    return hashlib.sha256(api_key.encode()).hexdigest()


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify an API key against its hash."""
    return secrets.compare_digest(hash_api_key(plain_key), hashed_key)
