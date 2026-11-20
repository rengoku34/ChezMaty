"""
Les VUES de l'accueil et du scan.
"""
import json

from django.http import JsonResponse
from django.shortcuts import redirect, render

from ..security import agent_required
from ..services.attendance import scan_code
from .auth import accueil_selon_role


def accueil(request):
    """La racine du site : connecté, on va à sa page ; sinon, à la connexion."""
    if request.user.is_authenticated:
        return redirect(accueil_selon_role(request.user))
    return redirect('/connexion')


@agent_required      # réservé aux agents de scan (et à l'administrateur)
def scanner(request):
    """La page de scan.

    GET  : affiche la page.
    POST : reçoit un QR code lu (en JSON), répond en JSON : le JavaScript de la page affiche le résultat
           (écran vert « Présence confirmée », ou orange / rouge avec la raison) et joue un bip.
    """
    if request.method == 'POST':
        try:
            code = json.loads(request.body or b'{}').get('code')
        except (ValueError, AttributeError):       # corps vide ou pas du JSON
            code = None
        statut, reponse = scan_code(code, request.user)
        return JsonResponse(reponse, status=statut)
    return render(request, 'scan.html', {'title': 'Scanner les QR codes'})
