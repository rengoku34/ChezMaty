// Les horaires saisis (champ datetime-local) sont des heures « murales » sans fuseau :
// on les affiche telles quelles. Les horodatages de la base sont et convertis vers le fuseau choisi.
function createFormatters(timezone) {
  const wallClock = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });
  const hourOnly = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'UTC' });
  const timestamp = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone });

  function parseWallClock(value) {
    const date = value ? new Date(`${value}Z`) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  return {
    eventDate(value) {
      const date = parseWallClock(value);
      return date ? wallClock.format(date) : '';
    },
    eventRange(debut, fin) {
      const start = parseWallClock(debut);
      const end = parseWallClock(fin);
      if (start && end) {
        const sameDay = debut.slice(0, 10) === fin.slice(0, 10);
        return `${wallClock.format(start)} – ${sameDay ? hourOnly.format(end) : wallClock.format(end)}`;
      }
      if (start) return wallClock.format(start);
      return '';
    },
    timestamp(value) {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : timestamp.format(date);
    },
  };
}

module.exports = { createFormatters };
