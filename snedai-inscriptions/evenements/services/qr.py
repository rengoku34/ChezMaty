"""
Le QR code du billet.

Le QR code contient un texte secret : « SNEDAI-EVT: » suivi du code unique du billet (qr_token).
L'agent le scanne, le serveur retrouve le billet correspondant et enregistre la présence.
"""
import base64
import io
import re

import qrcode
from qrcode.constants import ERROR_CORRECT_M

PREFIXE = 'SNEDAI-EVT:'
_JETON = re.compile(r'^[A-Za-z0-9_-]{20,64}$')    # un vrai code : 20 à 64 caractères, lettres/chiffres/_/-


def qr_content(token):
    """Le texte exact placé dans le QR code."""
    return f'{PREFIXE}{token}'


def token_from_scan(brut):
    """Retrouve le code du billet à partir de ce que le scanner a lu.
    Accepte le texte complet du QR, ou seulement le code (saisi à la main). Renvoie None si invalide."""
    valeur = str(brut or '').strip()
    jeton = valeur[len(PREFIXE):] if valeur.startswith(PREFIXE) else valeur
    return jeton if _JETON.match(jeton) else None


def _image(token, taille_case):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=taille_case, border=2)   # M = résiste aux petites taches
    qr.add_data(qr_content(token))
    qr.make(fit=True)
    return qr.make_image(fill_color='black', back_color='white')


def qr_png(token):
    """Le QR code sous forme de fichier PNG (pour le téléchargement)."""
    tampon = io.BytesIO()
    _image(token, 12).save(tampon, format='PNG')
    return tampon.getvalue()


def qr_data_url(token):
    """Le QR code sous forme de texte « data:image/png;base64,... » : on peut le mettre directement dans
    <img src="..."> sans créer de fichier."""
    tampon = io.BytesIO()
    _image(token, 8).save(tampon, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(tampon.getvalue()).decode()
