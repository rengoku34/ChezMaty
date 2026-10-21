"""Tests d'integration de l'inscription et des sessions d'authentification."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.rate_limit import limiter
from app.db.session import create_session_factory
from app.main import create_app
from app.models import PasswordResetToken


def create_test_client(tmp_path: Path, *, smtp_enabled: bool = False) -> TestClient:
    """Construire une API isolee avec une base temporaire."""
    limiter.reset()
    settings = Settings(
        _env_file=None,
        app_name="Chez Maty tests",
        app_env="development",
        secret_key="cle-de-test-locale-suffisamment-longue-123456",
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        cors_origins="http://localhost:5500",
        cookie_secure=False,
        smtp_host="smtp.example.test" if smtp_enabled else None,
        smtp_from_email="noreply@example.test" if smtp_enabled else None,
    )
    application = create_app(settings, create_session_factory(settings))
    return TestClient(application)


def test_cross_site_session_cookie_configuration(tmp_path: Path) -> None:
    """Émettre des cookies compatibles avec les appels du frontend Netlify."""
    settings = Settings(
        _env_file=None,
        app_name="Chez Maty tests",
        app_env="production",
        secret_key="cle-de-test-locale-suffisamment-longue-123456",
        database_url=f"sqlite:///{(tmp_path / 'cross-site.db').as_posix()}",
        cors_origins="https://chezmaty.netlify.app",
        cookie_secure=True,
        cookie_samesite="none",
    )
    client = TestClient(create_app(settings, create_session_factory(settings)))
    with client:
        response = client.post(
            "/api/auth/register",
            json={
                "full_name": "Awa Kouassi",
                "email": "awa@example.com",
                "password": "motdepasse-solide-123",
            },
        )
    assert response.status_code == 201
    cookies = response.headers.get_list("set-cookie")
    assert any("samesite=none" in cookie.lower() and "secure" in cookie.lower() for cookie in cookies)


def test_register_current_user_refresh_and_logout(tmp_path: Path) -> None:
    """Verifier la creation du compte, la rotation du refresh et la deconnexion."""
    with create_test_client(tmp_path) as client:
        registration = client.post(
            "/api/auth/register",
            json={
                "full_name": "  Awa   Kouassi ",
                "email": "AWA@example.com",
                "phone": "0709 109 224",
                "password": "motdepasse-solide-123",
            },
        )
        assert registration.status_code == 201
        assert registration.json()["user"]["email"] == "awa@example.com"
        assert "password_hash" not in registration.json()["user"]
        assert client.cookies.get("access_token")
        assert client.cookies.get("refresh_token")
        assert client.cookies.get("csrf_token")

        profile = client.get("/api/auth/me")
        assert profile.status_code == 200
        assert profile.json()["full_name"] == "Awa Kouassi"

        csrf_token = client.cookies.get("csrf_token")
        refreshed = client.post(
            "/api/auth/refresh",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert refreshed.status_code == 200

        logout = client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": client.cookies.get("csrf_token")},
        )
        assert logout.status_code == 204
        assert client.get("/api/auth/me").status_code == 401


def test_registration_sends_welcome_email(tmp_path: Path, monkeypatch) -> None:
    """Notifier le client après la création de son compte."""
    import app.api.routes.auth as auth_routes

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        auth_routes,
        "send_welcome_email",
        lambda settings, recipient, full_name: sent.append((recipient, full_name)),
    )
    with create_test_client(tmp_path, smtp_enabled=True) as client:
        response = client.post(
            "/api/auth/register",
            json={
                "full_name": "Awa Kouassi",
                "email": "awa@example.com",
                "password": "motdepasse-solide-123",
            },
        )
    assert response.status_code == 201
    assert response.json()["email_sent"] is True
    assert sent == [("awa@example.com", "Awa Kouassi")]


def test_registration_reports_unavailable_welcome_email(tmp_path: Path) -> None:
    """Créer le compte même si l'e-mail de bienvenue n'est pas configuré."""
    with create_test_client(tmp_path) as client:
        response = client.post(
            "/api/auth/register",
            json={
                "full_name": "Awa Kouassi",
                "email": "awa@example.com",
                "password": "motdepasse-solide-123",
            },
        )
        assert response.status_code == 201
        assert response.json()["email_sent"] is False
        assert "e-mail de bienvenue n'a pas pu être envoyé" in response.json()["message"]
        assert client.get("/api/auth/me").status_code == 200


def test_duplicate_registration_and_invalid_login(tmp_path: Path) -> None:
    """Refuser un email deja enregistre et des identifiants incorrects."""
    with create_test_client(tmp_path) as client:
        account = {
            "full_name": "Awa Kouassi",
            "email": "awa@example.com",
            "password": "motdepasse-solide-123",
        }
        assert client.post("/api/auth/register", json=account).status_code == 201
        duplicate = client.post("/api/auth/register", json=account)
        assert duplicate.status_code == 409

        client.post("/api/auth/logout", headers={"X-CSRF-Token": client.cookies.get("csrf_token")})
        failed_login = client.post(
            "/api/auth/login",
            json={"email": "awa@example.com", "password": "incorrect"},
        )
        assert failed_login.status_code == 401
        invalid_credentials = client.post(
            "/api/auth/login",
            json={"email": "awa@example.com", "password": "mauvais-mot-de-passe"},
        )
        assert invalid_credentials.status_code == 401


def test_password_reset_is_single_use_and_revokes_refresh_token(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Valider le jeton unique, le changement du mot de passe et la révocation."""
    import app.api.routes.auth as auth_routes

    sent_urls: list[str] = []
    monkeypatch.setattr(
        auth_routes,
        "send_password_reset_email",
        lambda settings, recipient, reset_url: sent_urls.append(reset_url),
    )

    with create_test_client(tmp_path, smtp_enabled=True) as client:
        registration = client.post(
            "/api/auth/register",
            json={
                "full_name": "Awa Kouassi",
                "email": "awa@example.com",
                "password": "motdepasse-solide-123",
            },
        )
        assert registration.status_code == 201
        csrf_token = client.cookies.get("csrf_token")

        request_reset = client.post(
            "/api/auth/forgot-password",
            json={"email": "AWA@example.com"},
        )
        assert request_reset.status_code == 202
        assert len(sent_urls) == 1
        reset_token = parse_qs(urlparse(sent_urls[0]).fragment)["reset_token"][0]

        reset = client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "new_password": "nouveau-mot-de-passe-456"},
        )
        assert reset.status_code == 204
        assert client.post(
            "/api/auth/refresh",
            headers={"X-CSRF-Token": csrf_token},
        ).status_code == 401
        assert client.post(
            "/api/auth/login",
            json={"email": "awa@example.com", "password": "motdepasse-solide-123"},
        ).status_code == 401
        assert client.post(
            "/api/auth/login",
            json={"email": "awa@example.com", "password": "nouveau-mot-de-passe-456"},
        ).status_code == 200
        assert client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "new_password": "autre-mot-de-passe-789"},
        ).status_code == 400


def test_forgot_password_response_does_not_reveal_unknown_email(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Conserver une réponse générique sans envoyer de message à une adresse inconnue."""
    import app.api.routes.auth as auth_routes

    def unexpected_email(*args: object) -> None:
        raise AssertionError("Aucun email ne doit être envoyé pour une adresse inconnue.")

    monkeypatch.setattr(auth_routes, "send_password_reset_email", unexpected_email)

    with create_test_client(tmp_path, smtp_enabled=True) as client:
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "inconnue@example.com"},
        )
        assert response.status_code == 202
        assert response.json()["message"] == (
            "Si cette adresse possède un compte actif, un e-mail de réinitialisation va être envoyé."
        )


def test_failed_reset_email_invalidates_issued_token(tmp_path: Path, monkeypatch) -> None:
    """Ne pas laisser utilisable un jeton si son email n'a pas pu être expédié."""
    import app.api.routes.auth as auth_routes

    attempted_urls: list[str] = []

    def fail_to_send(settings, recipient, reset_url) -> None:
        attempted_urls.append(reset_url)
        raise OSError("SMTP indisponible")

    monkeypatch.setattr(auth_routes, "send_password_reset_email", fail_to_send)

    with create_test_client(tmp_path, smtp_enabled=True) as client:
        assert client.post(
            "/api/auth/register",
            json={
                "full_name": "Awa Kouassi",
                "email": "awa@example.com",
                "password": "motdepasse-solide-123",
            },
        ).status_code == 201
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "awa@example.com"},
        )
        assert response.status_code == 503
        reset_token = parse_qs(urlparse(attempted_urls[0]).fragment)["reset_token"][0]
        assert client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "new_password": "nouveau-mot-de-passe-456"},
        ).status_code == 400


def test_expired_password_reset_token_is_rejected(tmp_path: Path, monkeypatch) -> None:
    """Refuser un jeton dont la date d'expiration est dépassée."""
    import app.api.routes.auth as auth_routes

    sent_urls: list[str] = []
    monkeypatch.setattr(
        auth_routes,
        "send_password_reset_email",
        lambda settings, recipient, reset_url: sent_urls.append(reset_url),
    )

    with create_test_client(tmp_path, smtp_enabled=True) as client:
        assert client.post(
            "/api/auth/register",
            json={
                "full_name": "Awa Kouassi",
                "email": "awa@example.com",
                "password": "motdepasse-solide-123",
            },
        ).status_code == 201
        assert client.post(
            "/api/auth/forgot-password",
            json={"email": "awa@example.com"},
        ).status_code == 202
        reset_token = parse_qs(urlparse(sent_urls[0]).fragment)["reset_token"][0]

        session = client.app.state.session_factory()
        try:
            stored_token = session.query(PasswordResetToken).filter_by(
                token_hash=sha256(reset_token.encode("utf-8")).hexdigest()
            ).one()
            stored_token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            session.commit()
        finally:
            session.close()

        response = client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "new_password": "nouveau-mot-de-passe-456"},
        )
        assert response.status_code == 400
