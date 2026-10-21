"""Inscription, connexion, renouvellement et deconnexion."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import logging
import smtplib
from urllib.parse import quote
import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_app_settings, get_current_user, require_csrf
from app.core.config import Settings
from app.core.email import send_password_reset_email, send_welcome_email
from app.core.rate_limit import limiter
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_csrf_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models import PasswordResetToken, RefreshToken, User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentification"])
logger = logging.getLogger(__name__)


def set_auth_cookies(response: Response, user: User, db: Session, settings: Settings) -> None:
    """Emettre des cookies d'acces, de renouvellement et de protection CSRF."""
    refresh_jwt, jti, expires_at = create_refresh_token(user.id, settings)
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires_at))
    db.commit()

    cookie_options = {
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "path": "/",
    }
    response.set_cookie(
        "access_token",
        create_access_token(user.id, settings),
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        **cookie_options,
    )
    response.set_cookie(
        "refresh_token",
        refresh_jwt,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        **cookie_options,
    )
    response.set_cookie(
        "csrf_token",
        create_csrf_token(),
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=False,
        **cookie_options,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthResponse:
    """Creer un compte client puis ouvrir sa session."""
    user = User(
        full_name=payload.full_name,
        email=str(payload.email),
        phone=payload.phone,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.flush()
        set_auth_cookies(response, user, db, settings)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cette adresse email est deja utilisee.") from exc

    db.refresh(user)
    try:
        send_welcome_email(settings, user.email, user.full_name)
    except (OSError, smtplib.SMTPException, RuntimeError):
        logger.exception("Echec de l'envoi de l'email de bienvenue.")
        return AuthResponse(
            user=UserResponse.model_validate(user),
            message="Compte créé et connexion ouverte, mais l'e-mail de bienvenue n'a pas pu être envoyé.",
            email_sent=False,
        )
    return AuthResponse(
        user=UserResponse.model_validate(user),
        message="Compte créé, connexion ouverte et e-mail de bienvenue envoyé.",
        email_sent=True,
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthResponse:
    """Verifier les identifiants et emettre les cookies de session."""
    user = db.scalar(select(User).where(User.email == str(payload.email)))
    hash_to_check = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_is_valid = verify_password(payload.password, hash_to_check)
    if user is None or not password_is_valid or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    set_auth_cookies(response, user, db, settings)
    return AuthResponse(user=UserResponse.model_validate(user), message="Connexion reussie.")


@router.post("/refresh", response_model=AuthResponse, dependencies=[Depends(require_csrf)])
def refresh_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AuthResponse:
    """Faire tourner le jeton de renouvellement et invalider le precedent."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton de renouvellement absent.")
    try:
        payload = decode_token(token, settings, "refresh")
        user_id = int(payload["sub"])
        jti = str(payload["jti"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Jeton de renouvellement invalide.") from exc

    now = datetime.now(timezone.utc)
    result = db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.jti == jti,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .values(revoked_at=now)
    )
    user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if result.rowcount != 1 or user is None:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expiree ou deja renouvelee.")

    set_auth_cookies(response, user, db, settings)
    return AuthResponse(user=UserResponse.model_validate(user), message="Session renouvelee.")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> Response:
    """Revoquer le jeton de renouvellement et supprimer les cookies."""
    token = request.cookies.get("refresh_token")
    if token:
        try:
            payload = decode_token(token, settings, "refresh")
            db.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.jti == str(payload["jti"]),
                    RefreshToken.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(timezone.utc))
            )
            db.commit()
        except (jwt.InvalidTokenError, KeyError, TypeError):
            db.rollback()

    for cookie_name in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(
            cookie_name,
            path="/",
            secure=settings.cookie_secure,
            httponly=cookie_name != "csrf_token",
            samesite=settings.cookie_samesite,
        )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserResponse)
def read_current_user(user: User = Depends(get_current_user)) -> UserResponse:
    """Retourner le profil du compte authentifie."""
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse, dependencies=[Depends(require_csrf)])
def update_current_user(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserResponse:
    """Mettre a jour uniquement les preferences et coordonnees modifiables."""
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Aucune modification fournie.")
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    response: Response,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict[str, str]:
    """Envoyer par email des instructions generiques de reinitialisation."""
    if not settings.smtp_host or not settings.smtp_from_email:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La récupération par e-mail n'est pas encore configurée. Contactez Chez Maty sur WhatsApp.",
        )

    user = db.scalar(
        select(User).where(User.email == str(payload.email), User.is_active.is_(True))
    )
    raw_token = secrets.token_urlsafe(48)
    if user is not None:
        now = datetime.now(timezone.utc)
        token_hash = sha256(raw_token.encode("utf-8")).hexdigest()
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=now + timedelta(minutes=settings.password_reset_expire_minutes),
            )
        )
        db.commit()

        reset_url = (
            f"{settings.frontend_url.rstrip('/')}/compte.html"
            f"#reset_token={quote(raw_token, safe='')}"
        )
        try:
            send_password_reset_email(settings, str(payload.email), reset_url)
        except (OSError, smtplib.SMTPException, RuntimeError) as exc:
            db.rollback()
            reset_token = db.scalar(
                select(PasswordResetToken).where(
                    PasswordResetToken.token_hash == sha256(raw_token.encode("utf-8")).hexdigest(),
                    PasswordResetToken.used_at.is_(None),
                )
            )
            if reset_token is not None:
                reset_token.used_at = datetime.now(timezone.utc)
                db.commit()
            logger.exception("Echec de l'envoi d'un email de reinitialisation.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="L'e-mail de récupération n'a pas pu être envoyé. Réessayez plus tard.",
            ) from exc
    return {
        "message": "Si cette adresse possède un compte actif, un e-mail de réinitialisation va être envoyé."
    }


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    response: Response,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> Response:
    """Remplacer le mot de passe avec un jeton valide et le rendre inutilisable."""
    token_hash = sha256(payload.token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    reset_token = db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    if reset_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce lien est invalide ou expiré. Demandez une nouvelle réinitialisation.",
        )

    consume_result = db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.id == reset_token.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(used_at=now)
        .execution_options(synchronize_session=False)
    )
    if consume_result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce lien est invalide ou expiré. Demandez une nouvelle réinitialisation.",
        )
    user = db.scalar(select(User).where(User.id == reset_token.user_id, User.is_active.is_(True)))
    if user is None:
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce lien n'est plus valide.")
    user.password_hash = hash_password(payload.new_password)
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None),
    ).update({RefreshToken.revoked_at: now}, synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
