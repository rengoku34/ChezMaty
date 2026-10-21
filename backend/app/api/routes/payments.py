"""Initialisation et confirmation serveur des paiements CinetPay."""

import asyncio
import secrets
from hmac import compare_digest
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_app_settings, get_current_user, require_csrf
from app.core.config import Settings
from app.db.session import get_db
from app.models import Order, Payment, PaymentWebhookEvent, User
from app.schemas.payment import PaymentStartRead, PaymentStatusRead
from app.services.cinetpay import CinetPayError, initialize_payment, verify_payment

router = APIRouter(prefix="/payments", tags=["Paiements"])


def _public_api_url(settings: Settings) -> str:
    """Retourner l'origine publique utilisee par les callbacks CinetPay."""
    return settings.payment_public_api_url.rstrip("/")


def _payment_status(data: dict[str, Any]) -> str:
    """Normaliser les statuts CinetPay connus en statuts internes."""
    provider_status = str(data.get("status", "")).upper()
    if provider_status in {"SUCCESS", "ACCEPTED"}:
        return "paye"
    if provider_status in {"FAILED", "EXPIRED", "CANCELLED", "REFUSED"}:
        return "echoue"
    return "en_attente"


def _apply_verified_status(
    db: Session,
    payment: Payment,
    order: Order,
    data: dict[str, Any],
) -> None:
    """Mettre a jour l'etat uniquement apres verification authentifiee par CinetPay."""
    merchant_transaction_id = data.get("merchant_transaction_id") or data.get("transaction_id")
    amount = data.get("amount")
    currency = str(data.get("currency", "")).upper()
    if (
        (merchant_transaction_id is not None and str(merchant_transaction_id) != payment.internal_reference)
        or not str(amount).isdigit()
        or int(amount) != payment.amount_xof
        or currency != "XOF"
    ):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Les informations de paiement verifiees par CinetPay ne correspondent pas a la commande.",
        )

    provider_status = str(data.get("status", "")).upper()
    if not provider_status:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="CinetPay n'a pas renvoye de statut de paiement exploitable.",
        )
    new_status = _payment_status(data)
    event_id = f"cinetpay:{payment.internal_reference}:{provider_status}"
    if db.scalar(select(PaymentWebhookEvent.id).where(PaymentWebhookEvent.event_id == event_id)) is None:
        db.add(
            PaymentWebhookEvent(
                event_id=event_id,
                payment_id=payment.id,
                processing_result=new_status,
            )
        )
    if payment.status != "paye":
        payment.status = new_status
    if new_status == "paye":
        order.status = "paye"
    db.commit()


def _verify_payment(
    db: Session,
    settings: Settings,
    payment: Payment,
    order: Order,
) -> None:
    """Consulter CinetPay puis appliquer la reponse de verification."""
    try:
        data = verify_payment(settings, payment.internal_reference)
    except CinetPayError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    _apply_verified_status(db, payment, order, data)


@router.post(
    "/orders/{order_id}/start",
    response_model=PaymentStartRead,
    dependencies=[Depends(require_csrf)],
)
def start_order_payment(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_app_settings),
) -> PaymentStartRead:
    """Creer une tentative puis obtenir la page de paiement CinetPay."""
    order = db.scalar(
        select(Order)
        .options(joinedload(Order.user))
        .where(Order.id == order_id, Order.user_id == user.id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if order.status == "paye":
        raise HTTPException(status_code=409, detail="Cette commande est deja payee.")
    if settings.payment_provider.lower() != "cinetpay":
        raise HTTPException(status_code=503, detail="Le prestataire de paiement configure n'est pas pris en charge.")

    payment = Payment(
        order_id=order.id,
        provider="cinetpay",
        internal_reference=f"CM{secrets.token_hex(8).upper()}",
        amount_xof=order.total_xof,
        status="en_attente",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    callback_base = _public_api_url(settings)
    return_url = (
        f"{settings.frontend_url.rstrip('/')}/panier.html"
        f"?payment_return=1&order_id={order.id}"
    )
    try:
        payment_url, notify_token = initialize_payment(
            settings,
            transaction_id=payment.internal_reference,
            amount_xof=payment.amount_xof,
            description=f"Commande {order.order_number} Chez Maty",
            notify_url=f"{callback_base}/api/payments/cinetpay/notify",
            return_url=return_url,
            customer_name=user.full_name,
            customer_email=user.email,
            customer_phone=user.phone or order.recipient_phone,
        )
    except CinetPayError as exc:
        payment.status = "erreur"
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    payment.provider_reference = notify_token
    db.commit()
    return PaymentStartRead(payment_url=payment_url, status=payment.status, order_id=order.id)


@router.get("/orders/{order_id}/status", response_model=PaymentStatusRead)
def read_order_payment_status(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_app_settings),
) -> PaymentStatusRead:
    """Verifier aupres de CinetPay le dernier paiement de sa commande."""
    order = db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user.id))
    if order is None:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if order.status == "paye":
        return PaymentStatusRead(
            order_id=order.id,
            order_number=order.order_number,
            order_status=order.status,
            payment_status="paye",
        )
    payment = db.scalar(
        select(Payment)
        .where(Payment.order_id == order.id, Payment.provider == "cinetpay")
        .order_by(Payment.created_at.desc(), Payment.id.desc())
    )
    if payment is not None and payment.status not in {"paye", "echoue", "erreur"}:
        _verify_payment(db, settings, payment, order)
        db.refresh(order)
        db.refresh(payment)
    return PaymentStatusRead(
        order_id=order.id,
        order_number=order.order_number,
        order_status=order.status,
        payment_status=payment.status if payment else None,
    )


@router.get("/cinetpay/notify")
def cinetpay_notify_health() -> dict[str, str]:
    """Repondre au ping GET de disponibilite effectue par CinetPay."""
    return {"message": "Notification CinetPay disponible."}


@router.post("/cinetpay/notify")
async def cinetpay_notify(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict[str, str]:
    """Traiter les notifications fournisseur après confirmation côté serveur."""
    payload: dict[str, Any] = dict(request.query_params)
    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            body = await request.json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Notification CinetPay invalide.") from exc
        if isinstance(body, dict):
            payload.update(body)
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        payload.update(dict(await request.form()))
    transaction_id = (
        payload.get("merchant_transaction_id")
        or payload.get("cpm_trans_id")
        or payload.get("transaction_id")
    )
    if not isinstance(transaction_id, str) or not transaction_id:
        raise HTTPException(status_code=400, detail="Reference de transaction CinetPay absente.")
    payment = db.scalar(
        select(Payment).where(
            Payment.internal_reference == transaction_id,
            Payment.provider == "cinetpay",
        )
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Transaction CinetPay inconnue.")
    received_notify_token = payload.get("notify_token")
    if (
        not isinstance(received_notify_token, str)
        or not payment.provider_reference
        or not compare_digest(received_notify_token, payment.provider_reference)
    ):
        raise HTTPException(status_code=401, detail="Jeton de notification CinetPay invalide.")
    order = db.get(Order, payment.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    try:
        data = await asyncio.to_thread(verify_payment, settings, payment.internal_reference)
    except CinetPayError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    _apply_verified_status(db, payment, order, data)
    return {"message": "Notification verifiee."}
