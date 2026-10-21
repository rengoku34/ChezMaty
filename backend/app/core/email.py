"""Envoi des emails transactionnels avec les parametres SMTP."""

from email.message import EmailMessage
import smtplib

from app.core.config import Settings


def _send_email(settings: Settings, message: EmailMessage) -> None:
    """Envoyer un message en utilisant le serveur SMTP configure."""
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Le service SMTP n'est pas configure.")

    message["From"] = settings.smtp_from_email
    smtp_class = smtplib.SMTP_SSL if settings.smtp_use_tls and settings.smtp_port == 465 else smtplib.SMTP
    with smtp_class(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        if settings.smtp_use_tls and settings.smtp_port != 465:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def send_password_reset_email(
    settings: Settings,
    recipient: str,
    reset_url: str,
) -> None:
    """Envoyer un lien a usage unique de reinitialisation du mot de passe."""
    message = EmailMessage()
    message["Subject"] = "Réinitialiser votre mot de passe Chez Maty"
    message["To"] = recipient
    message.set_content(
        "Bonjour,\n\n"
        "Une demande de réinitialisation du mot de passe Chez Maty a été reçue. "
        "Si cette adresse possède un compte, utilisez le lien ci-dessous dans "
        f"les {settings.password_reset_expire_minutes} minutes :\n\n"
        f"{reset_url}\n\n"
        "Si vous n'avez pas demandé cette réinitialisation, ignorez ce message."
    )

    _send_email(settings, message)


def send_order_receipt_email(
    settings: Settings,
    recipient: str,
    order_number: str,
    pdf_content: bytes,
) -> None:
    """Envoyer le reçu PDF d'une commande payée."""
    message = EmailMessage()
    message["Subject"] = f"Votre reçu Chez Maty — commande {order_number}"
    message["To"] = recipient
    message.set_content(
        "Bonjour,\n\n"
        f"Nous confirmons la réception du paiement de votre commande {order_number}. "
        "Vous trouverez votre reçu en pièce jointe.\n\n"
        "Merci d'avoir choisi Chez Maty !"
    )
    message.add_attachment(
        pdf_content,
        maintype="application",
        subtype="pdf",
        filename=f"recu-{order_number}.pdf",
    )
    _send_email(settings, message)
