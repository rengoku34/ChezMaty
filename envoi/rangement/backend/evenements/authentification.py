"""
La DURÉE DE VIE DU JETON. Un jeton qui n'expire jamais donne un accès éternel à celui qui le trouve
(Zebra perdu, téléphone prêté...). Ici, le jeton cesse de marcher après JETON_DUREE_HEURES heures (12 par défaut) :
la personne doit alors se reconnecter avec son mot de passe.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


def duree_jeton():
    return timedelta(hours=getattr(settings, "JETON_DUREE_HEURES", 12))


def expiration(jeton):
    """Le moment où ce jeton cesse de marcher."""
    return jeton.created + duree_jeton()


def jeton_expire(jeton):
    return timezone.now() >= expiration(jeton)


class JetonExpirant(TokenAuthentication):
    """Comme l'authentification par jeton habituelle, mais un jeton trop ancien est refusé (et supprimé)."""

    def authenticate_credentials(self, cle):
        utilisateur, jeton = super().authenticate_credentials(cle)
        if jeton_expire(jeton):
            jeton.delete()
            raise AuthenticationFailed("Session expirée : reconnectez-vous.")
        return utilisateur, jeton
