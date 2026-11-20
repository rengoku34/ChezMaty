"""
Les ADRESSES des pages HTML : le lien envoyé aux employés, le formulaire, la page de remerciement, le billet (QR code), la connexion et le scan.
"""
from django.contrib.auth.views import LogoutView
from django.urls import path

from . import views

urlpatterns = [
    path("e/<str:lien>/", views.evenement_accueil, name="evenement-accueil"),                  # le lien envoyé aux employés
    path("e/<str:lien>/formulaire/", views.evenement_formulaire, name="evenement-formulaire"),
    path("e/<str:lien>/merci/", views.evenement_merci, name="evenement-merci"),                # après l'envoi du formulaire
    path("billet/<str:jeton>/", views.billet, name="billet"),                                  # le billet avec le QR code
    path("billet/<str:jeton>/qr.png", views.billet_png, name="billet-png"),                    # le QR code en image
    path("connexion/", views.ConnexionView.as_view(), name="connexion"),
    path("deconnexion/", LogoutView.as_view(next_page="/connexion/"), name="deconnexion"),
    path("scan/", views.scan, name="scan"),                                                    # scanner les QR codes dans un navigateur
]
