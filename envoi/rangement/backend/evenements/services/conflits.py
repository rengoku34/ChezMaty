"""
Les CONFLITS de salle : deux événements ne peuvent pas avoir lieu dans le même lieu, le même jour,
à des heures qui se chevauchent. Un événement sans créneau occupe toute la journée.
"""
import re
import unicodedata

from ..models import Evenement

JOURNEE = (0, 24 * 60)            # (début, fin) en minutes : de 00:00 à 24:00


def normaliser(lieu):
    """« Salle  PLATEAU » et « salle plateau » sont le même lieu : on ignore majuscules, accents et espaces en trop."""
    texte = unicodedata.normalize("NFKD", lieu or "")
    texte = "".join(caractere for caractere in texte if not unicodedata.combining(caractere))
    return re.sub(r"\s+", " ", texte).strip().casefold()


def _minutes(heure):
    heures, minutes = heure.split(":")
    return int(heures) * 60 + int(minutes)


def plages(creneaux):
    """Les créneaux « 09:00-10:30 » sous forme de (début, fin) en minutes. Sans créneau : toute la journée."""
    if not creneaux:
        return [JOURNEE]
    return [tuple(_minutes(heure) for heure in creneau.split("-")) for creneau in creneaux]


def se_chevauchent(creneaux_a, creneaux_b):
    """Vrai si une plage de A empiète sur une plage de B. Deux plages qui se touchent (10:00 et 10:00) ne se chevauchent pas."""
    return any(debut_a < fin_b and debut_b < fin_a for debut_a, fin_a in plages(creneaux_a) for debut_b, fin_b in plages(creneaux_b))


def trouver_conflit(lieu, date, creneaux, exclure_pk=None):
    """Renvoie un autre événement qui occupe déjà ce lieu (un objet Lieu) à ces heures ce jour-là, ou None."""
    autres = Evenement.objects.filter(date=date, lieu=lieu).select_related("lieu")
    if exclure_pk:
        autres = autres.exclude(pk=exclure_pk)
    for autre in autres:
        if se_chevauchent(creneaux, autre.creneaux):
            return autre
    return None


def message_conflit(autre):
    quand = "toute la journée" if not autre.creneaux else "créneaux " + ", ".join(autre.creneaux)
    return f"Conflit : l'événement « {autre.nom} » occupe déjà « {autre.lieu.nom} » le {autre.date:%d/%m/%Y} ({quand})."
