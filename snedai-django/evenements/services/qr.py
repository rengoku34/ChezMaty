import base64
import io
import re

import qrcode
from qrcode.constants import ERROR_CORRECT_M

QR_PREFIX = 'SNEDAI-EVT:'
_TOKEN = re.compile(r'^[A-Za-z0-9_-]{20,64}$')


def qr_content(token):
    return f'{QR_PREFIX}{token}'


def token_from_scan(raw):
    """Accepte le contenu complet du QR code, ou le seul jeton saisi à la main."""
    value = str(raw or '').strip()
    token = value[len(QR_PREFIX):] if value.startswith(QR_PREFIX) else value
    return token if _TOKEN.match(token) else None


def _image(token, box_size):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=box_size, border=2)
    qr.add_data(qr_content(token))
    qr.make(fit=True)
    return qr.make_image(fill_color='black', back_color='white')


def qr_png(token):
    buffer = io.BytesIO()
    _image(token, 12).save(buffer, format='PNG')
    return buffer.getvalue()


def qr_data_url(token):
    buffer = io.BytesIO()
    _image(token, 8).save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
