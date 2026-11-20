"""
Le QR code du billet.

Le QR code contient seulement le code secret unique de l'inscription (qr_token, 32 caractères).
L'agent le scanne, le serveur retrouve l'inscription correspondante et note la présence.

Pour être lu facilement par un lecteur (Zebra, douchette) même sur un écran de téléphone :
- le contenu est court (donc peu de petits carrés) ;
- la correction d'erreur est au niveau « L » (le plus léger, donc le QR code le plus simple) ;
- la marge blanche autour est de 4 carrés, comme le demande la norme.
"""
import base64
import io
import re

import qrcode
from qrcode.constants import ERROR_CORRECT_L

CODE = re.compile(r"[A-Za-z0-9]{32}$")        # le code secret : 32 lettres ou chiffres, toujours à la fin du texte lu


def extraire_jeton(texte_lu):
    """Retrouve le code de l'inscription dans ce que le lecteur a lu (le code seul, ou précédé d'autres caractères).
    Renvoie None si le texte ne se termine pas par un code valide."""
    trouve = CODE.search(str(texte_lu or "").strip())
    return trouve.group() if trouve else None


def _image(jeton, taille_case):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_L, box_size=taille_case, border=4)
    qr.add_data(jeton)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")


def qr_png(jeton):
    """Le QR code sous forme de fichier PNG (pièce jointe de l'e-mail, téléchargement)."""
    tampon = io.BytesIO()
    _image(jeton, 12).save(tampon, format="PNG")
    return tampon.getvalue()


def qr_data_url(jeton):
    """Le QR code sous forme de texte « data:image/png;base64,... » : on peut le mettre directement dans
    <img src="..."> sans créer de fichier."""
    tampon = io.BytesIO()
    _image(jeton, 10).save(tampon, format="PNG")
    return "data:image/png;base64," + base64.b64encode(tampon.getvalue()).decode()
