"""Dependances FastAPI pour les sessions et comptes authentifies."""

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models import User


def get_app_settings(request: Request) -> Settings:
    """Lire la configuration associee a cette instance d'application."""
    return request.app.state.settings


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> User:
    """Identifier le compte depuis le cookie HttpOnly d'acces."""
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Connexion requise.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token, settings, "access")
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalide ou expiree.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable ou desactive.")
    return user


def require_csrf(request: Request) -> None:
    """Verifier le jeton CSRF avant toute operation authentifiee d'ecriture."""
    from hmac import compare_digest

    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token or not compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Jeton CSRF absent ou invalide.")
