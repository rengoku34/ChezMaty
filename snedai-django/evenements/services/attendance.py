"""Confirmation de présence et scan, communs au site et à l'application."""
import logging

from . import queries
from .formatting import timestamp
from .mailer import get_mailer
from .qr import qr_png, token_from_scan
from ..models import Participation

logger = logging.getLogger(__name__)


def confirm_attendance(event, user):
    """Crée le billet (une seule fois) et envoie le QR code par e-mail à la première confirmation."""
    participation, created = queries.confirm_participation(event, user)
    emailed = False
    if created:
        try:
            emailed = bool(get_mailer().send_qr_code(event, user, qr_png(participation.qr_token), event.range_text))
        except Exception as error:
            logger.error('QR code non envoyé à %s : %s', user.email, error)
    return participation, not created, emailed


def scan_code(raw_code, agent):
    """Scan d'un QR code par un agent : renvoie (code HTTP, corps de la réponse JSON)."""
    token = token_from_scan(raw_code)
    participation = Participation.objects.select_related('user', 'event').filter(qr_token=token).first() if token else None
    if not participation:
        return 404, {'ok': False, 'status': 'inconnu', 'message': 'QR code inconnu ou invalide.'}

    user, event = participation.user, participation.event
    person = {'nom': user.nom, 'prenom': user.prenom, 'filiale': user.filiale, 'evenement': event.titre}
    if event.termine_at:
        return 409, {'ok': False, 'status': 'termine', 'message': 'Cet événement est déjà terminé.', 'person': person}
    if participation.scanne_at:
        return 409, {'ok': False, 'status': 'deja', 'message': f'Déjà scanné le {timestamp(participation.scanne_at)}.', 'person': person}
    if not queries.mark_scanned(participation, agent):
        return 409, {'ok': False, 'status': 'deja', 'message': 'Ce QR code vient déjà d’être scanné.', 'person': person}
    return 200, {'ok': True, 'status': 'present', 'message': 'Présence confirmée.', 'person': person}
