import re

from django.core.exceptions import ValidationError

MAX_CRENEAUX = 4
FORMAT_CRENEAU = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$")    # ex. 09:00-10:30
TELEPHONE = re.compile(r"^[0-9 .\-]+$")


def valider_creneaux(creneaux):
    """4 créneaux au maximum, au format 09:00-10:30, avec le début avant la fin, sans doublon."""
    if not isinstance(creneaux, list):
        raise ValidationError("Les créneaux doivent former une liste.")
    if len(creneaux) > MAX_CRENEAUX:
        raise ValidationError(f"{MAX_CRENEAUX} créneaux au maximum.")
    if len(set(creneaux)) != len(creneaux):
        raise ValidationError("Un même créneau est écrit deux fois.")
    for creneau in creneaux:
        if not FORMAT_CRENEAU.match(str(creneau)):
            raise ValidationError(f"« {creneau} » n'est pas au bon format (exemple : 09:00-10:30).")
        debut, fin = creneau.split("-")
        if fin <= debut:
            raise ValidationError(f"« {creneau} » : la fin doit être après le début.")


def chiffres_du_telephone(telephone):
    """Ne garde que les chiffres : « 07 00-00.00 00 » devient « 0700000000 »."""
    return "".join(c for c in str(telephone) if c.isdigit())


def valider_telephone(telephone):
    """Exactement 10 chiffres (espaces, points et tirets acceptés entre les chiffres)."""
    if not TELEPHONE.match(str(telephone)) or len(chiffres_du_telephone(telephone)) != 10:
        raise ValidationError("Le numéro doit contenir exactement 10 chiffres.")
