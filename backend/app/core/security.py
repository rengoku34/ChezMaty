"""Hachage des mots de passe, JWT et protection CSRF."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt
from pwdlib import PasswordHash

from app.core.config import Settings

password_hasher = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hasher.hash("mot-de-passe-factice-inutilisable")


def hash_password(password: str) -> str:
    """Hacher un mot de passe avec Argon2."""
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verifier un mot de passe sans jamais le journaliser."""
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: int, settings: Settings) -> str:
    """Creer un JWT d'acces de courte duree."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "access",
        "jti": str(uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int, settings: Settings) -> tuple[str, str, datetime]:
    """Creer un JWT de renouvellement et retourner son identifiant révocable."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    jti = str(uuid4())
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_token(token: str, settings: Settings, expected_type: str) -> dict[str, Any]:
    """Verifier signature, expiration et type d'un JWT."""
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["exp", "iat", "sub", "jti", "type"]},
    )
    if payload["type"] != expected_type:
        raise jwt.InvalidTokenError("Type de jeton incorrect.")
    return payload


def create_csrf_token() -> str:
    """Generer le jeton CSRF partage avec le navigateur."""
    return secrets.token_urlsafe(32)
