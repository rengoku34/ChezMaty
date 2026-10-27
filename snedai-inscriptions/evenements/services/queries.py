"""
Les REQUÊTES vers la base de données utilisées par plusieurs pages.
« Event.objects.filter(...) » est l'ORM de Django : il écrit le SQL à notre place.
"""
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from ..models import Event, Inscription


def liste_evenements():
    """Tous les événements avec le nombre d'inscrits et de présents (calculés par la base, en une seule requête)."""
    return Event.objects.annotate(
        nb_inscrits=Count('inscriptions'),
        nb_presents=Count('inscriptions', filter=Q(inscriptions__present=True)),
    ).order_by('-created_at')


def inscrire(event, valeurs):
    """Crée l'inscription. Renvoie (inscription, True) si elle est nouvelle, (inscription existante, False) sinon."""
    existante = Inscription.objects.filter(event=event, email__iexact=valeurs['email']).first()
    if existante:
        return existante, False
    try:
        with transaction.atomic():
            return Inscription.objects.create(event=event, **valeurs), True
    except IntegrityError:    # deux envois simultanés avec la même adresse : l'autre a gagné
        return Inscription.objects.get(event=event, email__iexact=valeurs['email']), False


def marquer_present(inscription, agent):
    """Passe « présent » à VRAI. Renvoie True SEULEMENT si ce scan est le premier pour ce QR code.

    L'astuce : on demande à la base de modifier la ligne « seulement si present est encore FAUX ».
    Si deux agents scannent le même billet exactement au même moment, un seul des deux « gagne » (update renvoie 1),
    l'autre reçoit 0 : impossible de compter deux fois la même personne.
    """
    modifiees = Inscription.objects.filter(pk=inscription.pk, present=False).update(
        present=True, scanne_at=timezone.now(), scanne_par=agent)
    return modifiees == 1
