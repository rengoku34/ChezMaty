"""« Ajouter à mon agenda » : liens Google Agenda / Outlook et fichier .ics (iPhone, Outlook bureau…)."""
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from urllib.parse import urlencode, urlparse
from zoneinfo import ZoneInfo

from django.conf import settings

DEFAULT_DURATION = timedelta(hours=2)
_WALL = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$')


def wall_clock_to_date(value, time_zone=None):
    """Heure saisie « 2026-11-14T09:00 » (heure locale du fuseau) → instant réel (UTC)."""
    if not value or not _WALL.match(value):
        return None
    naive = datetime.strptime(value, '%Y-%m-%dT%H:%M')
    return naive.replace(tzinfo=ZoneInfo(time_zone or settings.TIME_ZONE)).astimezone(dt_timezone.utc)


def event_times(event, time_zone=None):
    start = wall_clock_to_date(event.debut, time_zone)
    if not start:
        return None
    end = wall_clock_to_date(event.fin, time_zone) or start + DEFAULT_DURATION
    return start, end


def _compact(date):
    return date.astimezone(dt_timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def _iso(date):
    return date.astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def calendar_links(event):
    times = event_times(event)
    if not times:
        return None
    start, end = times
    details = f'{event.description[:1500]}\n\n{settings.APP_URL}/evenements/{event.id}'
    google = 'https://calendar.google.com/calendar/render?' + urlencode(
        {'action': 'TEMPLATE', 'text': event.titre, 'dates': f'{_compact(start)}/{_compact(end)}', 'details': details, 'location': event.lieu or ''}
    )
    outlook = 'https://outlook.office.com/calendar/0/deeplink/compose?' + urlencode(
        {'path': '/calendar/action/compose', 'rru': 'addevent', 'subject': event.titre, 'startdt': _iso(start), 'enddt': _iso(end), 'body': details, 'location': event.lieu or ''}
    )
    return {'google': google, 'outlook': outlook, 'ics': f'/evenements/{event.id}/agenda.ics'}


def _escape(value):
    return str(value or '').replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\r\n', '\\n').replace('\n', '\\n')


def _fold(line):
    out, current = [], ''
    for char in line:
        if len((current + char).encode()) > 74:
            out.append(current)
            current = ' ' + char
        else:
            current += char
    out.append(current)
    return '\r\n'.join(out)


def build_ics(event):
    times = event_times(event)
    if not times:
        return None
    start, end = times
    host = urlparse(settings.APP_URL).hostname
    url = f'{settings.APP_URL}/evenements/{event.id}'
    lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SNEDAI//Evenements//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        f'UID:evenement-{event.id}@{host}',
        f'DTSTAMP:{_compact(datetime.now(dt_timezone.utc))}',
        f'DTSTART:{_compact(start)}',
        f'DTEND:{_compact(end)}',
        f'SUMMARY:{_escape(event.titre)}',
        f'DESCRIPTION:{_escape(event.description + chr(10) + chr(10) + url)}',
        *([f'LOCATION:{_escape(event.lieu)}'] if event.lieu else []),
        f'URL:{url}',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Rappel', 'TRIGGER:-PT1H', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR',
    ]
    return '\r\n'.join(_fold(line) for line in lines) + '\r\n'


def next_event(events):
    """Événement à mettre en avant : celui qui a lieu en ce moment, sinon le prochain à venir."""
    now = datetime.now(dt_timezone.utc)
    timed = []
    for event in events:
        times = event_times(event)
        if times and times[1] > now:
            timed.append((times[0], event))
    if not timed:
        return None
    start, event = min(timed, key=lambda item: item[0])
    return {'event': event, 'start': start.strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'en_cours': start <= now}
