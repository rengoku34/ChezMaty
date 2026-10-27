// « Ajouter à mon agenda » : liens Google Agenda / Outlook et fichier .ics (iPhone, Outlook bureau…).
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

// Décalage (ms) du fuseau à un instant donné : heure murale du fuseau moins l'heure UTC.
function zoneOffset(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

// Heure saisie « 2026-11-14T09:00 » (heure locale du fuseau) → instant réel.
function wallClockToDate(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - zoneOffset(new Date(guess), timeZone);
  utc = guess - zoneOffset(new Date(utc), timeZone); // seconde passe pour les changements d'heure
  return new Date(utc);
}

function eventTimes(event, timeZone) {
  const start = wallClockToDate(event.debut, timeZone);
  if (!start) return null;
  const end = wallClockToDate(event.fin, timeZone) || new Date(start.getTime() + DEFAULT_DURATION_MS);
  return { start, end };
}

const compact = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261114T090000Z

function calendarLinks(event, { timeZone, appUrl }) {
  const times = eventTimes(event, timeZone);
  if (!times) return null;
  const details = `${event.description.slice(0, 1500)}\n\n${appUrl}/evenements/${event.id}`;
  const google = new URL('https://calendar.google.com/calendar/render');
  google.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.titre,
    dates: `${compact(times.start)}/${compact(times.end)}`,
    details,
    location: event.lieu || '',
  });
  const outlook = new URL('https://outlook.office.com/calendar/0/deeplink/compose');
  outlook.search = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.titre,
    startdt: times.start.toISOString(),
    enddt: times.end.toISOString(),
    body: details,
    location: event.lieu || '',
  });
  return { google: google.toString(), outlook: outlook.toString(), ics: `/evenements/${event.id}/agenda.ics` };
}

// Texte d'un champ iCalendar : caractères spéciaux échappés, lignes repliées à 75 octets.
const escapeText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char) > 74) {
      out.push(current);
      current = ` ${char}`;
    } else current += char;
  }
  out.push(current);
  return out.join('\r\n');
}

function buildIcs(event, { timeZone, appUrl }) {
  const times = eventTimes(event, timeZone);
  if (!times) return null;
  const host = new URL(appUrl).hostname;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SNEDAI//Evenements//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:evenement-${event.id}@${host}`,
    `DTSTAMP:${compact(new Date())}`,
    `DTSTART:${compact(times.start)}`,
    `DTEND:${compact(times.end)}`,
    `SUMMARY:${escapeText(event.titre)}`,
    `DESCRIPTION:${escapeText(`${event.description}\n\n${appUrl}/evenements/${event.id}`)}`,
    ...(event.lieu ? [`LOCATION:${escapeText(event.lieu)}`] : []),
    `URL:${appUrl}/evenements/${event.id}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Rappel',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

module.exports = { wallClockToDate, eventTimes, calendarLinks, buildIcs };
