// Taux affichés dans le tableau de bord et le rapport PDF (en %, arrondis ; null si rien à diviser).
const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : null);

function eventRates({ inscrits, confirmes, presents }) {
  return {
    reponse: percent(confirmes, inscrits), // inscrits qui ont dit « je serai présent(e) »
    presence: percent(presents, confirmes), // présences annoncées réellement venues (QR scanné)
  };
}

// Ajoute à chaque filiale ses taux et la largeur relative de sa barre dans le graphique.
function filialeRows(rows) {
  const max = Math.max(1, ...rows.map((r) => r.inscrits));
  return rows.map((r) => ({
    ...r,
    ...eventRates(r),
    barInscrits: (r.inscrits / max) * 100,
    barConfirmes: (r.confirmes / max) * 100,
    barPresents: (r.presents / max) * 100,
  }));
}

module.exports = { percent, eventRates, filialeRows };
