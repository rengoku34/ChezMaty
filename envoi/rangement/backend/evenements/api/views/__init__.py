"""Les vues de l'API, rangées par sujet (compte, événements, lieux, inscription, scan)."""
from .compte import ConnexionJetonView, deconnexion_jeton, moi, ping
from .evenements import EvenementViewSet
from .inscription import InscriptionPubliqueView
from .lieux import LieuViewSet
from .scan import ScanView

__all__ = ["ConnexionJetonView", "deconnexion_jeton", "moi", "ping", "EvenementViewSet", "InscriptionPubliqueView", "LieuViewSet", "ScanView"]
