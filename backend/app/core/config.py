"""Chargement et validation de la configuration de l'application."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Parametres lus depuis l'environnement et le fichier .env local."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Chez Maty"
    app_env: str = "development"
    debug: bool = False
    secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=90)
    database_url: str = "sqlite:///./chezmaty.db"
    cors_origins: str = "http://127.0.0.1:5500,http://localhost:5500"
    frontend_url: str = "http://127.0.0.1:5500"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    upload_dir: str = "backend/uploads"
    max_upload_size_mb: int = Field(default=5, ge=1, le=20)
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True
    password_reset_expire_minutes: int = Field(default=30, ge=5, le=120)
    payment_provider: str = "cinetpay"
    payment_sandbox: bool = True
    cinetpay_api_key: str | None = None
    cinetpay_site_id: str | None = None
    payment_public_api_url: str = "http://127.0.0.1:8000"

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        """Refuser les valeurs d'exemple et les secrets trop courts."""
        if value.startswith("REMPLACER_") or len(value) < 32:
            raise ValueError(
                "SECRET_KEY doit etre une cle aleatoire d'au moins 32 caracteres."
            )
        return value

    @field_validator("cookie_samesite")
    @classmethod
    def validate_cookie_samesite(cls, value: str) -> str:
        """Limiter SameSite aux valeurs reconnues par les navigateurs."""
        normalized = value.lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE doit valoir lax, strict ou none.")
        return normalized

    @property
    def allowed_origins(self) -> list[str]:
        """Retourner les origines CORS configurees, sans element vide."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_upload_dir(self) -> Path:
        """Resoudre le dossier d'images par rapport au projet."""
        path = Path(self.upload_dir)
        return path if path.is_absolute() else PROJECT_ROOT / path


@lru_cache
def get_settings() -> Settings:
    """Fournir une instance de configuration partagee."""
    return Settings()
