"""Schemas de validation des routes d'authentification."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Donnees demandees pour creer un compte client."""

    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        """Supprimer les espaces superflus du nom."""
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Le nom doit contenir au moins deux caracteres.")
        return normalized

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        """Normaliser l'adresse pour eviter les doublons de casse."""
        return str(value).strip().lower()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str | None) -> str | None:
        """Nettoyer les espaces du telephone sans imposer un format local."""
        return " ".join(value.split()) if value else None


class LoginRequest(BaseModel):
    """Identifiants soumis à la connexion."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        """Normaliser l'adresse avant la recherche."""
        return str(value).strip().lower()


class UserResponse(BaseModel):
    """Informations publiques du compte connecte."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    phone: str | None
    role: str
    email_notifications_enabled: bool
    push_notifications_enabled: bool


class AuthResponse(BaseModel):
    """Reponse des routes d'inscription et de connexion."""

    user: UserResponse
    message: str


class ProfileUpdateRequest(BaseModel):
    """Champs modifiables du profil client."""

    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    email_notifications_enabled: bool | None = None
    push_notifications_enabled: bool | None = None

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str | None) -> str | None:
        """Normaliser le nom sans modifier les autres champs."""
        if value is None:
            return None
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Le nom doit contenir au moins deux caracteres.")
        return normalized

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str | None) -> str | None:
        """Nettoyer les espaces du telephone."""
        return " ".join(value.split()) if value else value


class ForgotPasswordRequest(BaseModel):
    """Adresse recevant les instructions de reinitialisation."""

    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        """Normaliser l'adresse email avant la recherche du compte."""
        return str(value).strip().lower()


class ResetPasswordRequest(BaseModel):
    """Jeton a usage unique et nouveau mot de passe."""

    token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=10, max_length=128)
