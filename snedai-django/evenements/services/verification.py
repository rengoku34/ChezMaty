"""Code à 6 chiffres envoyé par e-mail pour confirmer une adresse (site et application)."""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from django.conf import settings

CODE_TTL = timedelta(minutes=15)
RESEND_DELAY_SECONDS = 60
MAX_ATTEMPTS = 5


def generate_code():
    return f'{secrets.randbelow(1000000):06d}'


def hash_code(code):
    """Seule l'empreinte du code est conservée, jamais le code lui-même."""
    return hashlib.sha256(f'{settings.SECRET_KEY}:{code}'.encode()).hexdigest()


def code_matches(code, expected_hash):
    digits = re.sub(r'\D', '', str(code or ''))
    if len(digits) != 6 or not isinstance(expected_hash, str):
        return False
    return hmac.compare_digest(hash_code(digits), expected_hash)
