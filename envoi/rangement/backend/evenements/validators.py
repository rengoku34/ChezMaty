import re

from django.core.exceptions import ValidationError

MAX_CRENEAUX = 4
FORMAT_CRENEAU = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$")    # ex. 09:00-10:30
TELEPHONE = re.compile(r"^\+?[0-9 .\-()]{8,20}$")


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


def valider_telephone(telephone):
    """Au moins 8 chiffres ; espaces, points, tirets, parenthèses et « + » au début acceptés."""
    if not TELEPHONE.match(telephone) or sum(c.isdigit() for c in telephone) < 8:
        raise ValidationError("Numéro de téléphone invalide.")
