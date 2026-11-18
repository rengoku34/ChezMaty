"""
La règle du SCAN : un agent scanne le QR code d'un inscrit, le serveur décide de la réponse.
"""
from django.utils import timezone

from ..models import Inscription
from .qr import extraire_jeton


def traiter_scan(code_lu, agent):
    """Traite un QR code scanné. Renvoie (code HTTP, réponse).

    Les trois issues possibles :
      - 200 « present » : première fois, « present » passe à VRAI ;
      - 409 « deja »    : ce billet a déjà été scanné ;
      - 404 « inconnu » : le code ne correspond à aucune inscription.
    """
    jeton = extraire_jeton(code_lu)
    inscription = Inscription.objects.select_related("evenement").filter(qr_token=jeton).first() if jeton else None
    if not inscription:
        return 404, {"statut": "inconnu", "message": "QR code inconnu ou invalide."}

    # Ces informations s'affichent à l'écran de l'agent : il voit QUI vient d'entrer.
    personne = {
        "nom": inscription.nom, "prenom": inscription.prenom, "filiale": inscription.filiale,
        "evenement": inscription.evenement.nom, "creneau": inscription.creneau,
    }
    if inscription.present:
        if inscription.scanne_le:
            quand = timezone.localtime(inscription.scanne_le).strftime("%d/%m/%Y à %H:%M")
            message = f"Déjà scanné le {quand}."
        else:
            message = "Déjà scanné."
        return 409, {"statut": "deja", "message": message, "personne": personne}

    # L'astuce : on demande à la base de modifier la ligne « seulement si present est encore FAUX ».
    # Si deux agents scannent le même billet au même instant, un seul « gagne » (update renvoie 1) :
    # impossible de compter deux fois la même personne.
    modifiees = Inscription.objects.filter(pk=inscription.pk, present=False).update(
        present=True, scanne_le=timezone.now(), scanne_par=agent,
    )
    if modifiees != 1:
        return 409, {"statut": "deja", "message": "Ce QR code vient déjà d'être scanné.", "personne": personne}
    return 200, {"statut": "present", "message": "Présence confirmée.", "personne": personne}
