"""
Mise en forme des dates en français (« samedi 14 novembre 2026 à 09:00 »).

Deux sortes de dates dans le projet :
  - les horaires d'un événement, saisis par l'administrateur : « 2026-11-14T09:00 ». On les affiche TELS QUELS
    (heure du mur), sans conversion de fuseau, pour ne jamais décaler l'heure.
  - les horodatages de la base (inscription, scan…) : stockés en UTC, convertis en heure locale d'Abidjan.
"""
from datetime import datetime

from django.utils import timezone

JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']


def lire_horaire(valeur):
    """Transforme « 2026-11-14T09:00 » en date Python. Renvoie None si le texte est vide ou invalide."""
    if not valeur:
        return None
    try:
        return datetime.strptime(valeur, '%Y-%m-%dT%H:%M')
    except ValueError:
        return None


def _date_complete(date):
    jour = '1er' if date.day == 1 else str(date.day)   # en français : « 1er novembre », mais « 2 novembre »
    return f'{JOURS[date.weekday()]} {jour} {MOIS[date.month - 1]} {date.year} à {date:%H:%M}'


def event_date(valeur):
    """« samedi 14 novembre 2026 à 09:00 »"""
    date = lire_horaire(valeur)
    return _date_complete(date) if date else ''


def event_range(debut, fin):
    """« samedi 14 novembre 2026 à 09:00 – 16:00 » (la fin n'est répétée en entier que si c'est un autre jour)."""
    d, f = lire_horaire(debut), lire_horaire(fin)
    if d and f:
        meme_jour = debut[:10] == fin[:10]
        return f'{_date_complete(d)} – {f:%H:%M}' if meme_jour else f'{_date_complete(d)} – {_date_complete(f)}'
    return _date_complete(d) if d else ''


def event_day(valeur):
    """Pour la pastille de date des cartes : {'jour': '14', 'mois': 'nov'}. None s'il n'y a pas d'horaire."""
    date = lire_horaire(valeur)
    if not date:
        return None
    return {'jour': str(date.day), 'mois': MOIS_COURTS[date.month - 1].replace('.', '')}


def event_hours(debut, fin):
    """« 09:00 – 16:00 » (vide s'il n'y a pas d'horaire)."""
    d, f = lire_horaire(debut), lire_horaire(fin)
    if not d:
        return ''
    if f and debut[:10] == fin[:10]:
        return f'{d:%H:%M} – {f:%H:%M}'
    return f'{d:%H:%M}'


def timestamp(valeur):
    """Date de la base (UTC) -> heure locale d'Abidjan : « 14/11/2026 09:05 »."""
    if not valeur:
        return ''
    return timezone.localtime(valeur).strftime('%d/%m/%Y %H:%M')
