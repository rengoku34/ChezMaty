const { eventTimes } = require('../calendar');

// Événement à mettre en avant : celui qui a lieu en ce moment, sinon le prochain à venir.
function nextEvent(events, timeZone, now = Date.now()) {
  const timed = events
    .map((event) => ({ event, times: eventTimes(event, timeZone) }))
    .filter(({ times }) => times && times.end.getTime() > now)
    .sort((a, b) => a.times.start - b.times.start);
  if (!timed.length) return null;
  const { event, times } = timed[0];
  return { event, start: times.start.toISOString(), enCours: times.start.getTime() <= now };
}

module.exports = { nextEvent };
