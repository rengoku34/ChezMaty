"""Petits outils partagés par plusieurs vues."""
import functools

from ..models import Event
from ..security import not_found


def charger_evenement(vue):
    """Décorateur : retrouve l'événement dont le numéro est dans l'adresse (/admin/evenements/3) et le passe à la vue.
    S'il n'existe pas, on affiche une page « introuvable »."""
    @functools.wraps(vue)
    def enveloppe(request, event_id, *args, **kwargs):
        event = Event.objects.filter(pk=event_id).first()
        if not event:
            return not_found(request)
        return vue(request, event, *args, **kwargs)
    return enveloppe
