"""Requêtes réutilisées par le site, l'interface mobile et les exports."""
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from ..models import Event, Participation, User


def _sort_key(event):
    return event.debut or timezone.localtime(event.created_at).strftime('%Y-%m-%dT%H:%M')


def active_events():
    return sorted(Event.objects.filter(termine_at__isnull=True), key=_sort_key)


def finished_events():
    return list(Event.objects.filter(termine_at__isnull=False).order_by('-termine_at'))


def all_events():
    """Les événements en cours d'abord, puis les terminés ; du plus récent au plus ancien."""
    return sorted(Event.objects.all(), key=lambda e: (e.termine_at is not None, -e.created_at.timestamp()))


def participations_for(user):
    return {p.event_id: p for p in Participation.objects.filter(user=user)}


def attach_participations(events, user):
    mine = participations_for(user)
    for event in events:
        event.participation = mine.get(event.id)
    return events


def confirm_participation(event, user):
    try:
        with transaction.atomic():
            participation, created = Participation.objects.get_or_create(event=event, user=user)
    except IntegrityError:
        participation, created = Participation.objects.get(event=event, user=user), False
    return participation, created


def cancel_participation(event, user):
    Participation.objects.filter(event=event, user=user, scanne_at__isnull=True).delete()


def mark_scanned(participation, agent):
    """Renvoie True seulement si ce scan est le premier pour ce QR code."""
    return Participation.objects.filter(pk=participation.pk, scanne_at__isnull=True).update(scanne_at=timezone.now(), scanne_par=agent) == 1


def confirmed(event):
    return list(Participation.objects.filter(event=event).select_related('user').order_by('user__nom', 'user__prenom'))


def present(event):
    return list(Participation.objects.filter(event=event, scanne_at__isnull=False).select_related('user').order_by('scanne_at'))


def stats_by_filiale(event):
    """Par filiale : inscrits sur le site, présences annoncées et présences confirmées (QR)."""
    rows = User.objects.values('filiale').annotate(
        inscrits=Count('id', distinct=True),
        confirmes=Count('participations', filter=Q(participations__event=event)),
        presents=Count('participations', filter=Q(participations__event=event, participations__scanne_at__isnull=False)),
    )
    return sorted(rows, key=lambda r: (-r['confirmes'], -r['inscrits'], r['filiale']))
