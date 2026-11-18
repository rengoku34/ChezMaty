"""
Le style des e-mails : une lettre simple, comme les annonces internes de l'entreprise
(« Chers tous, ... Les inscriptions s'effectuent via le lien ci-après ... Cordialement, »).

Deux réglages facultatifs dans settings.py :
  CONTACT_EVENEMENTS    la personne à contacter pour plus d'informations (laisser vide pour ne rien afficher) ;
  SIGNATURE_EVENEMENTS  la signature en bas du message (« SNEDAI » par défaut).
"""
from django.conf import settings
from django.utils import formats, timezone


def jour(date):
    """« vendredi 23 octobre 2026 » (et « 1er » pour le premier du mois)."""
    numero = "1er" if date.day == 1 else str(date.day)
    return f"{formats.date_format(date, 'l')} {numero} {formats.date_format(date, 'F')} {date.year}"


def heure(valeur):
    """« 09:00 » devient « 9h », « 10:30 » devient « 10h30 »."""
    heures, minutes = valeur.split(":")
    return f"{int(heures)}h" + ("" if minutes == "00" else minutes)


def creneau_lisible(creneau):
    """« 09:00-10:30 » devient « de 9h à 10h30 »."""
    debut, fin = creneau.split("-")
    return f"de {heure(debut)} à {heure(fin)}"


def limite(evenement):
    """Jusqu'à quand on peut s'inscrire, en deux morceaux pour la phrase : (« jusqu'au », « vendredi 23 octobre 2026 à 11h30 »).
    Sans créneau, l'inscription reste ouverte toute la journée de l'événement."""
    if not evenement.creneaux:
        return "jusqu'à", f"la fin de la journée du {jour(evenement.date)}"
    fin = timezone.localtime(evenement.fin)
    return "jusqu'au", f"{jour(fin.date())} à {heure(fin.strftime('%H:%M'))}"


def contact():
    return (getattr(settings, "CONTACT_EVENEMENTS", "") or "").strip()


def signature():
    return (getattr(settings, "SIGNATURE_EVENEMENTS", "") or "SNEDAI").strip()
