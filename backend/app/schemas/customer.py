"""Schemas de validation des profils, adresses, paniers et commandes."""

import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_spaces(value: str) -> str:
    """Supprimer les espaces superflus sans interpréter le texte comme du HTML."""
    return " ".join(value.split())


class AddressInput(BaseModel):
    """Champs d'une adresse de livraison situee en Cote d'Ivoire."""

    recipient_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=7, max_length=30)
    city: str = Field(min_length=2, max_length=100)
    commune: str = Field(min_length=2, max_length=100)
    details: str = Field(min_length=5, max_length=500)
    is_default: bool = False

    @field_validator("recipient_name", "city", "commune", "details")
    @classmethod
    def clean_text(cls, value: str) -> str:
        """Normaliser les champs texte de l'adresse."""
        normalized = normalize_spaces(value)
        if len(normalized) < 2:
            raise ValueError("Ce champ doit contenir au moins deux caracteres.")
        return normalized

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        """Supprimer les espaces superflus du numero."""
        return normalize_spaces(value)


class AddressRead(AddressInput):
    """Adresse appartenant au client authentifie."""

    model_config = ConfigDict(from_attributes=True)

    id: int


class CartLineInput(BaseModel):
    """Article du panier soumis pour synchronisation depuis le navigateur."""

    product_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=99)
    customization: dict[str, str] = Field(default_factory=dict)

    @field_validator("customization")
    @classmethod
    def validate_customization(cls, value: dict[str, str]) -> dict[str, str]:
        """Limiter les options de personnalisation et leur taille."""
        allowed_keys = {"prenom", "couleur", "message"}
        if set(value) - allowed_keys:
            raise ValueError("Une option de personnalisation n'est pas reconnue.")
        limits = {"prenom": 30, "couleur": 80, "message": 160}
        normalized: dict[str, str] = {}
        for key, content in value.items():
            clean_content = normalize_spaces(content)
            if len(clean_content) > limits[key]:
                raise ValueError(f"L'option {key} est trop longue.")
            normalized[key] = clean_content
        return normalized


class CartSyncRequest(BaseModel):
    """Panier local a synchroniser vers le compte client."""

    items: list[CartLineInput] = Field(max_length=50)


class CartItemRead(BaseModel):
    """Ligne de panier avec le prix serveur actuel."""

    id: int
    product_id: int
    slug: str
    name: str
    price_xof: int
    image_path: str | None
    stock: int
    quantity: int
    customization: dict[str, str]


class CartRead(BaseModel):
    """Panier du client et total calcule par le serveur."""

    items: list[CartItemRead]
    total_xof: int


class OrderCreateRequest(BaseModel):
    """Adresse de livraison choisie pour convertir le panier en commande."""

    address_id: int = Field(gt=0)


class OrderItemRead(BaseModel):
    """Ligne copiee lors de la creation de la commande."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    unit_price_xof: int
    quantity: int
    customization: dict[str, str]

    @field_validator("customization", mode="before")
    @classmethod
    def parse_customization(cls, value: object) -> dict[str, str]:
        """Decoder l'instantane JSON stocke dans la ligne de commande."""
        if not value:
            return {}
        parsed = json.loads(value) if isinstance(value, str) else value
        if not isinstance(parsed, dict):
            raise ValueError("La personnalisation de la commande est invalide.")
        return {str(key): str(item) for key, item in parsed.items() if isinstance(item, str)}


class OrderRead(BaseModel):
    """Detail de commande prive au client proprietaire."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    total_xof: int
    status: str
    recipient_name: str
    recipient_phone: str
    delivery_city: str
    delivery_commune: str
    delivery_details: str
    created_at: datetime
    items: list[OrderItemRead]


class OrderListRead(BaseModel):
    """Liste des commandes du compte authentifie."""

    items: list[OrderRead]
    total: int


class ZoneRead(BaseModel):
    """Zone desservie et delai indicatif configure."""

    city: str
    commune: str
    delivery_hours: int
    conditions: str | None
