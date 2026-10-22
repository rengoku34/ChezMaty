"""Échange et validation des identifiants OpenID Connect Google et Apple."""

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import jwt

from app.core.config import Settings

GOOGLE_ISSUER = "https://accounts.google.com"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize"
APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


class SocialAuthError(RuntimeError):
    """Erreur de configuration ou de validation d'une connexion sociale."""


def _post_token(url: str, data: dict[str, str]) -> dict[str, Any]:
    try:
        response = httpx.post(url, data=data, headers={"Accept": "application/json"}, timeout=15.0)
        response.raise_for_status()
        result = response.json()
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
        raise SocialAuthError("Le fournisseur de connexion n'a pas pu confirmer cette session.") from exc
    if not isinstance(result, dict):
        raise SocialAuthError("Réponse invalide du fournisseur de connexion.")
    return result


def _verify_id_token(token: str, jwks_url: str, audience: str, issuer: str, nonce: str) -> dict[str, Any]:
    try:
        signing_key = jwt.PyJWKClient(jwks_url, cache_keys=True).get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, signing_key, algorithms=["RS256"], audience=audience,
            issuer=[issuer, "accounts.google.com"] if issuer == GOOGLE_ISSUER else issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "email", "nonce"]},
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        raise SocialAuthError("Le jeton d'identité du fournisseur est invalide.") from exc
    if claims.get("nonce") != nonce:
        raise SocialAuthError("La vérification de sécurité de la connexion a échoué.")
    if claims.get("email_verified") not in (True, "true", "1"):
        raise SocialAuthError("Le fournisseur n'a pas confirmé l'adresse e-mail de ce compte.")
    claims["email"] = str(claims["email"]).strip().lower()
    return claims


def exchange_google_code(code: str, settings: Settings, redirect_uri: str, nonce: str) -> dict[str, Any]:
    client_id, client_secret = settings.google_oauth_client_id, settings.google_oauth_client_secret
    if not client_id or not client_secret:
        raise SocialAuthError("Google n'est pas encore configuré pour Chez Maty.")
    result = _post_token(GOOGLE_TOKEN_URL, {
        "code": code, "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    })
    token = result.get("id_token")
    if not isinstance(token, str):
        raise SocialAuthError("Google n'a pas renvoyé de jeton d'identité.")
    return _verify_id_token(token, GOOGLE_JWKS_URL, client_id, GOOGLE_ISSUER, nonce)


def _apple_client_secret(settings: Settings, client_id: str) -> str:
    if not settings.apple_oauth_team_id or not settings.apple_oauth_key_id or not settings.apple_oauth_private_key:
        raise SocialAuthError("Apple n'est pas encore configuré pour Chez Maty.")
    now = datetime.now(timezone.utc)
    try:
        return jwt.encode(
            {"iss": settings.apple_oauth_team_id, "iat": now,
             "exp": now + timedelta(minutes=5), "aud": APPLE_ISSUER, "sub": client_id},
            settings.apple_oauth_private_key.replace("\\n", "\n"),
            algorithm="ES256", headers={"kid": settings.apple_oauth_key_id},
        )
    except (ValueError, TypeError, jwt.InvalidKeyError) as exc:
        raise SocialAuthError("La clé privée Apple configurée dans Render est invalide.") from exc


def exchange_apple_code(code: str, settings: Settings, redirect_uri: str, nonce: str) -> dict[str, Any]:
    client_id = settings.apple_oauth_client_id
    if not client_id:
        raise SocialAuthError("Apple n'est pas encore configuré pour Chez Maty.")
    result = _post_token(APPLE_TOKEN_URL, {
        "code": code, "client_id": client_id,
        "client_secret": _apple_client_secret(settings, client_id),
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    })
    token = result.get("id_token")
    if not isinstance(token, str):
        raise SocialAuthError("Apple n'a pas renvoyé de jeton d'identité.")
    return _verify_id_token(token, APPLE_JWKS_URL, client_id, APPLE_ISSUER, nonce)
