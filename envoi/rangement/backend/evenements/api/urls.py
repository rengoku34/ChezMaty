"""
Les ADRESSES de l'API (tout ce qui commence par /api/). Un « routeur » fabrique tout seul les adresses des événements et des lieux.
"""
from django.urls import include, path
from rest_framework import routers

from . import views

router = routers.DefaultRouter()
router.register("evenements", views.EvenementViewSet, basename="evenement")      # /api/evenements/...
router.register("lieux", views.LieuViewSet, basename="lieu")                      # /api/lieux/...

urlpatterns = [
    path("ping/", views.ping, name="api-ping"),                                   # le serveur répond-il ? (application mobile)
    path("auth/token/", views.ConnexionJetonView.as_view(), name="api-token"),    # se connecter : obtenir un jeton
    path("auth/moi/", views.moi, name="api-moi"),                                 # qui suis-je : nom et rôle
    path("auth/deconnexion/", views.deconnexion_jeton, name="api-deconnexion"),   # se déconnecter : supprimer le jeton
    path("scan/", views.ScanView.as_view(), name="api-scan"),                     # scanner un QR code
    path("public/evenements/<str:lien>/inscriptions/", views.InscriptionPubliqueView.as_view(), name="api-public-inscription"),
    path("", include(router.urls)),
]
