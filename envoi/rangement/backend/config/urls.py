"""
La liste des ADRESSES (URL) du projet.

Quand le navigateur demande une adresse, Django parcourt cette liste de haut en bas
et appelle la vue du premier chemin qui correspond.
"""
from django.conf import settings
from django.contrib import admin
from django.contrib.auth.views import LogoutView
from django.urls import include, path, re_path
from django.views.decorators.cache import never_cache
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import routers

from evenements import pages, views

# Le routeur fabrique tout seul les adresses de l'API à partir des viewsets.
router = routers.DefaultRouter()
router.register("evenements", views.EvenementViewSet, basename="evenement")
router.register("lieux", views.LieuViewSet, basename="lieu")

urlpatterns = [
    path("admin/", admin.site.urls),                                      # le backoffice (comptes et inscriptions)

    # --- Les pages (HTML) que voient les employés ---
    path("e/<str:lien>/", pages.evenement_accueil, name="evenement-accueil"),                 # le lien envoyé aux employés
    path("e/<str:lien>/formulaire/", pages.evenement_formulaire, name="evenement-formulaire"),
    path("e/<str:lien>/merci/", pages.evenement_merci, name="evenement-merci"),                # après l'envoi du formulaire
    path("billet/<str:jeton>/", pages.billet, name="billet"),                                 # le billet avec le QR code
    path("billet/<str:jeton>/qr.png", pages.billet_png, name="billet-png"),                   # le QR code en image

    # --- Les pages réservées : connexion, déconnexion, scan ---
    path("connexion/", pages.ConnexionView.as_view(), name="connexion"),
    path("deconnexion/", LogoutView.as_view(next_page="/connexion/"), name="deconnexion"),
    path("scan/", pages.scan, name="scan"),                                                   # scanner les QR codes

    # --- L'API ---
    path("api/ping/", views.ping, name="api-ping"),                                           # le serveur répond-il ? (application mobile)
    path("api/auth/token/", views.ConnexionJetonView.as_view(), name="api-token"),            # se connecter : obtenir un jeton
    path("api/auth/moi/", views.moi, name="api-moi"),                                         # qui suis-je : nom et rôle
    path("api/auth/deconnexion/", views.deconnexion_jeton, name="api-deconnexion"),           # se déconnecter : supprimer le jeton
    path("api/scan/", views.ScanView.as_view(), name="api-scan"),                             # scanner un QR code
    path("api/public/evenements/<str:lien>/inscriptions/", views.InscriptionPubliqueView.as_view(), name="api-public-inscription"),
    path("api/", include(router.urls)),                                   # /api/evenements/

    # --- La documentation automatique de l'API ---
    path("schema/", SpectacularAPIView.as_view(), name="schema"),                         # le plan de l'API (fichier technique)
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),         # Swagger : tester l'API dans le navigateur

    # never_cache : le navigateur redemande toujours la page au serveur. Serveur arrêté (Ctrl+C) = la page ne s'affiche plus.
    # --- Le même serveur sert l'application web (dossier web) et le fichier d'installation de l'application mobile ---
    path("snedai-scan.apk", serve, {"path": "snedai-scan.apk", "document_root": settings.DOSSIER_LIVRABLES}),
    path("", never_cache(serve), {"path": "index.html", "document_root": settings.DOSSIER_WEB}, name="accueil"),  # l'application de l'administrateur
    re_path(r"^(?P<path>app\.js|style\.css|logo\.png|icon-192\.png)$", never_cache(serve), {"document_root": settings.DOSSIER_WEB}),
]
