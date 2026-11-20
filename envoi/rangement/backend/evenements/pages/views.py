"""
Les PAGES HTML : ce que voient les humains dans le navigateur.
(Elles s'appuient sur l'API : le formulaire d'inscription et le scan appellent l'API avec JavaScript.)
"""
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie

from ..models import Evenement, Inscription
from ..api.permissions import est_administrateur, est_agent
from ..services.qr import qr_data_url, qr_png


# --- Ce que voient les employés (aucune connexion demandée) -----------------
def page_lien_expire(request, evenement):
    """La page affichée quand l'événement est terminé : le lien d'inscription a expiré."""
    return render(request, "public/expire.html", {"title": "Lien expiré", "evenement": evenement}, status=410)


def page_complet(request, evenement):
    """La page affichée quand toutes les places sont prises."""
    return render(request, "public/complet.html", {"title": "Complet", "evenement": evenement})


def evenement_accueil(request, lien):
    """/e/<lien>/ : la page d'accueil de l'événement : son nom, son lieu et le bouton « Démarrer »."""
    evenement = get_object_or_404(Evenement, lien=lien)
    if not evenement.inscriptions_ouvertes:
        return page_lien_expire(request, evenement)
    if evenement.complet:
        return page_complet(request, evenement)
    return render(request, "public/evenement.html", {"title": evenement.nom, "evenement": evenement})


def evenement_formulaire(request, lien):
    """/e/<lien>/formulaire/ : le formulaire d'inscription (il envoie ses données à l'API)."""
    evenement = get_object_or_404(Evenement, lien=lien)
    if not evenement.inscriptions_ouvertes:
        return page_lien_expire(request, evenement)
    if evenement.complet:
        return page_complet(request, evenement)
    return render(request, "public/formulaire.html", {
        "title": "Inscription", "evenement": evenement, "filiales": settings.FILIALES,
    })


def evenement_merci(request, lien):
    """/e/<lien>/merci/ : la page affichée après l'envoi du formulaire (on quitte le formulaire)."""
    evenement = get_object_or_404(Evenement, lien=lien)
    return render(request, "public/merci.html", {"title": "Merci", "evenement": evenement})


def billet(request, jeton):
    """/billet/<code secret>/ : la page du billet avec le QR code. Seul le code secret y donne accès."""
    inscription = get_object_or_404(Inscription.objects.select_related("evenement"), qr_token=jeton)
    return render(request, "public/billet.html", {
        "title": "Mon billet", "inscription": inscription, "evenement": inscription.evenement,
        "qr": qr_data_url(inscription.qr_token),
    })


def billet_png(request, jeton):
    """Télécharger le QR code en image PNG."""
    inscription = get_object_or_404(Inscription, qr_token=jeton)
    reponse = HttpResponse(qr_png(inscription.qr_token), content_type="image/png")
    reponse["Content-Disposition"] = 'attachment; filename="qrcode-snedai.png"'
    return reponse


# --- Ce que voient les agents de scan et l'administrateur -------------------
class ConnexionView(LoginView):
    """La page de connexion de l'administrateur et des agents de scan."""

    template_name = "connexion.html"
    redirect_authenticated_user = True
    extra_context = {"title": "Connexion"}

    def get_success_url(self):
        destination = self.get_redirect_url()
        if destination:
            return destination
        return "/admin/" if est_administrateur(self.request.user) else "/scan/"


@login_required
@ensure_csrf_cookie        # dépose le cookie de sécurité (CSRF) dont le JavaScript a besoin pour appeler l'API
def scan(request):
    """/scan/ : la page de scan des QR codes."""
    if not (est_administrateur(request.user) or est_agent(request.user)):
        return render(request, "erreur.html", {
            "title": "Accès refusé", "message": "Cette page est réservée aux agents de scan et à l'administrateur.",
        }, status=403)
    return render(request, "scan.html", {"title": "Scanner les QR codes"})
