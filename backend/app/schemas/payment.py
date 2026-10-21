"""Schemas des opérations de paiement et des reçus."""

from pydantic import BaseModel, Field


class PaymentStartRead(BaseModel):
    """URL de paiement hébergée par le prestataire."""

    payment_url: str = Field(min_length=1, max_length=2000)
    status: str


class PaymentStatusRead(BaseModel):
    """Statut du paiement d'une commande appartenant au client."""

    order_id: int
    order_status: str
    payment_status: str | None
