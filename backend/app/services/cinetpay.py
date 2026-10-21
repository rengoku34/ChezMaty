"""Client HTTP serveur-a-serveur pour l'API CinetPay v1."""

from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import Settings


class CinetPayError(RuntimeError):
    """Erreur exploitable renvoyee lorsqu'un appel CinetPay echoue."""


def _request(
    settings: Settings,
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    """Envoyer une requete HTTPS et valider la reponse JSON."""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    try:
        response = httpx.request(
            method,
            f"{settings.cinetpay_base_url.rstrip('/')}/{path.lstrip('/')}",
            json=payload,
            headers=headers,
            timeout=20.0,
        )
        response.raise_for_status()
        result = response.json()
    except httpx.RequestError as exc:
        raise CinetPayError("CinetPay est momentanement injoignable.") from exc
    except httpx.HTTPStatusError as exc:
        raise CinetPayError("CinetPay a refuse la requete de paiement.") from exc
    except ValueError as exc:
        raise CinetPayError("CinetPay a renvoye une reponse invalide.") from exc

    if not isinstance(result, dict):
        raise CinetPayError("CinetPay a renvoye une reponse invalide.")
    return result


def _access_token(settings: Settings) -> str:
    """Obtenir un jeton Bearer sans exposer les identifiants dans les logs."""
    api_key = settings.cinetpay_api_key
    api_password = settings.cinetpay_api_password
    if not api_key or not api_password:
        raise CinetPayError("Le paiement CinetPay n'est pas encore configure : cle et mot de passe API requis.")

    expected_prefix = "sk_test_" if settings.payment_sandbox else "sk_live_"
    if not api_key.startswith(expected_prefix):
        mode = "Sandbox" if settings.payment_sandbox else "production"
        raise CinetPayError(f"La cle API CinetPay ne correspond pas au mode {mode}.")

    result = _request(
        settings,
        "POST",
        "/v1/oauth/login",
        payload={"api_key": api_key, "api_password": api_password},
    )
    token = result.get("access_token")
    if not isinstance(token, str) or not token:
        raise CinetPayError("CinetPay n'a pas fourni de jeton d'acces valide.")
    return token


def _data(result: dict[str, Any]) -> dict[str, Any]:
    """Accepter une reponse API directe ou enveloppee dans `data`."""
    data = result.get("data")
    return data if isinstance(data, dict) else result


def initialize_payment(
    settings: Settings,
    *,
    transaction_id: str,
    amount_xof: int,
    description: str,
    notify_url: str,
    return_url: str,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
) -> tuple[str, str]:
    """Creer un paiement et retourner l'URL Checkout et le jeton webhook."""
    token = _access_token(settings)
    name_parts = customer_name.strip().split(maxsplit=1)
    first_name = name_parts[0] if name_parts else "Client"
    last_name = name_parts[1] if len(name_parts) > 1 else first_name
    result = _request(
        settings,
        "POST",
        "/v1/payment",
        access_token=token,
        payload={
            "currency": "XOF",
            "merchant_transaction_id": transaction_id,
            "amount": amount_xof,
            "lang": "fr",
            "designation": description[:160],
            "client_email": customer_email,
            "client_first_name": first_name[:80],
            "client_last_name": last_name[:80],
            "client_phone_number": customer_phone,
            "success_url": return_url,
            "failed_url": return_url,
            "notify_url": notify_url,
            "channel": "PUSH",
        },
    )
    data = _data(result)
    payment_url = data.get("payment_url") or data.get("paymentUrl")
    notify_token = data.get("notify_token") or data.get("notifyToken")
    if not isinstance(payment_url, str) or not payment_url.startswith("https://"):
        raise CinetPayError("CinetPay a renvoye une URL de paiement invalide.")
    if not isinstance(notify_token, str) or not notify_token:
        raise CinetPayError("CinetPay n'a pas renvoye le jeton de securite de notification.")
    return payment_url, notify_token


def verify_payment(settings: Settings, transaction_id: str) -> dict[str, Any]:
    """Verifier le statut canonique du paiement aupres de CinetPay."""
    token = _access_token(settings)
    encoded_id = quote(transaction_id, safe="")
    result = _request(
        settings,
        "GET",
        f"/v1/payment/{encoded_id}",
        access_token=token,
    )
    data = _data(result)
    if not isinstance(data.get("status"), str):
        raise CinetPayError("CinetPay n'a pas renvoye de statut de paiement exploitable.")
    return data
