"""Mise en forme des dates en français.

Les horaires saisis (champ datetime-local) sont des heures « murales » sans fuseau : on les affiche telles quelles.
Les horodatages de la base sont en UTC et convertis vers le fuseau du site.
"""
from datetime import datetime

from django.utils import timezone

JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']


def parse_wall_clock(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%dT%H:%M')
    except ValueError:
        return None


def _full(date):
    day = '1er' if date.day == 1 else str(date.day)
    return f'{JOURS[date.weekday()]} {day} {MOIS[date.month - 1]} {date.year} à {date:%H:%M}'


def _hour(date):
    return f'{date:%H:%M}'


def event_date(value):
    date = parse_wall_clock(value)
    return _full(date) if date else ''


def event_range(debut, fin):
    start, end = parse_wall_clock(debut), parse_wall_clock(fin)
    if start and end:
        same_day = debut[:10] == fin[:10]
        return f'{_full(start)} – {_hour(end) if same_day else _full(end)}'
    return _full(start) if start else ''


def event_day(value):
    """Pastille de date des cartes : {'jour': '14', 'mois': 'nov'} (None sans horaire)."""
    date = parse_wall_clock(value)
    if not date:
        return None
    return {'jour': str(date.day), 'mois': MOIS_COURTS[date.month - 1].replace('.', '')}


def event_hours(debut, fin):
    """Heure seule : « 09:00 – 16:00 » (vide si l'événement n'a pas d'horaire)."""
    start, end = parse_wall_clock(debut), parse_wall_clock(fin)
    if not start:
        return ''
    if end and debut[:10] == fin[:10]:
        return f'{_hour(start)} – {_hour(end)}'
    return _hour(start)


def timestamp(value):
    if not value:
        return ''
    return timezone.localtime(value).strftime('%d/%m/%Y %H:%M')
