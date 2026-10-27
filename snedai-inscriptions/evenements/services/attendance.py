"""
La règle métier du SCAN : un agent scanne le QR code d'un inscrit, le serveur décide de la réponse.
"""
from . import queries
from .formatting import timestamp
from .qr import token_from_scan
from ..models import Inscription


def scan_code(code_lu, agent):
    """Traite un QR code scanné. Renvoie (code HTTP, réponse JSON).

    Les trois issues possibles :
      - 200 « present » : première fois, « présent » passe à VRAI ;
      - 409 « deja »    : ce billet a déjà été scanné ;
      - 404 « inconnu » : le code ne correspond à aucune inscription.
    """
    jeton = token_from_scan(code_lu)
    inscription = Inscription.objects.select_related('event').filter(qr_token=jeton).first() if jeton else None
    if not inscription:
        return 404, {'ok': False, 'status': 'inconnu', 'message': 'QR code inconnu ou invalide.'}

    # Ces informations s'affichent à l'écran de l'agent : il voit QUI vient d'entrer.
    personne = {'nom': inscription.nom, 'prenom': inscription.prenom, 'filiale': inscription.filiale,
                'evenement': inscription.event.titre}

    if inscription.present:
        return 409, {'ok': False, 'status': 'deja', 'message': f'Déjà scanné le {timestamp(inscription.scanne_at)}.', 'person': personne}
    if not queries.marquer_present(inscription, agent):
        return 409, {'ok': False, 'status': 'deja', 'message': 'Ce QR code vient déjà d’être scanné.', 'person': personne}
    return 200, {'ok': True, 'status': 'present', 'message': 'Présence confirmée.', 'person': personne}
