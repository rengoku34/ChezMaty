"""Schemas Pydantic du catalogue et des avis clients."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryRead(BaseModel):
    """Categorie publique du catalogue."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None


class ProductImageRead(BaseModel):
    """Image visible sur une fiche produit."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    image_path: str
    alt_text: str
    position: int


class ProductRead(BaseModel):
    """Informations publiques d'un produit publie."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    name: str
    slug: str
    description: str
    price_xof: int
    stock: int
    recommended_age: str | None
    color: str | None
    customization_options: str | None
    is_featured: bool
    created_at: datetime
    images: list[ProductImageRead]


class ReviewCreate(BaseModel):
    """Avis rattache a une ligne d'achat verifiee."""

    order_item_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=3, max_length=2000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, value: str) -> str:
        """Nettoyer les espaces sans interpreter le texte comme du HTML."""
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Le commentaire doit contenir au moins trois caracteres.")
        return normalized


class ReviewRead(BaseModel):
    """Avis publie sans informations privees sur le client."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    rating: int
    comment: str
    created_at: datetime
    customer_name: str


class ReviewList(BaseModel):
    """Page d'avis approuves et total associe."""

    items: list[ReviewRead]
    total: int
