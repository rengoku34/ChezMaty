const ExcelJS = require('exceljs');

const PERSON_COLUMNS = [
  { header: 'Nom', key: 'nom', width: 22 },
  { header: 'Prénom', key: 'prenom', width: 22 },
  { header: 'Adresse e-mail', key: 'email', width: 34 },
  { header: 'Filiale', key: 'filiale', width: 24 },
];

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  sheet.addRows(rows);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D91' } };
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

// Les trois listes du tableau de bord, exportables ensemble ou une par une.
const LISTS = {
  inscrits: {
    sheet: 'Inscrits sur le site',
    columns: [...PERSON_COLUMNS, { header: 'Inscrit le', key: 'date', width: 20 }],
    row: (u, format) => ({ ...u, date: format.timestamp(u.created_at) }),
  },
  confirmes: {
    sheet: 'Présents annoncés',
    columns: [...PERSON_COLUMNS, { header: 'Confirmé le', key: 'date', width: 20 }, { header: 'Était là (QR scanné)', key: 'scan', width: 20 }],
    row: (p, format) => ({ ...p, date: format.timestamp(p.confirme_at), scan: p.scanne_at ? 'Oui' : 'Non' }),
  },
  presents: {
    sheet: 'Présents confirmés (QR)',
    columns: [...PERSON_COLUMNS, { header: 'Scanné le', key: 'date', width: 20 }],
    row: (p, format) => ({ ...p, date: format.timestamp(p.scanne_at) }),
  },
};

// Classeur d'un événement : résumé + les trois listes, ou une seule liste si « only » est donné.
async function buildEventWorkbook({ event, inscrits, confirmes, presents, format, only }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Événements SNEDAI';
  workbook.created = new Date();
  const rows = { inscrits, confirmes, presents };

  if (only) {
    const list = LISTS[only];
    addSheet(workbook, list.sheet, list.columns, rows[only].map((r) => list.row(r, format)));
    return workbook.xlsx.writeBuffer();
  }

  const summary = addSheet(
    workbook,
    'Résumé',
    [
      { header: 'Information', key: 'label', width: 30 },
      { header: 'Valeur', key: 'value', width: 60 },
    ],
    [
      { label: 'Événement', value: event.titre },
      { label: 'Date', value: format.eventRange(event.debut, event.fin) },
      { label: 'Lieu', value: event.lieu || '' },
      { label: 'Statut', value: event.termine_at ? `Terminé (${format.timestamp(event.termine_at)})` : 'En cours' },
      { label: 'Inscrits sur le site', value: inscrits.length },
      { label: 'Ont dit qu’ils seront présents', value: confirmes.length },
      { label: 'Présents confirmés (QR scanné)', value: presents.length },
    ]
  );
  summary.autoFilter = undefined;

  for (const [key, list] of Object.entries(LISTS)) {
    addSheet(workbook, list.sheet, list.columns, rows[key].map((r) => list.row(r, format)));
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildEventWorkbook, LIST_NAMES: Object.keys(LISTS) };
