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

// Classeur d'un événement : résumé + les trois listes du tableau de bord.
async function buildEventWorkbook({ event, inscrits, confirmes, presents, format }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Événements SNEDAI';
  workbook.created = new Date();

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

  addSheet(workbook, 'Inscrits sur le site', [...PERSON_COLUMNS, { header: 'Inscrit le', key: 'date', width: 20 }],
    inscrits.map((u) => ({ ...u, date: format.timestamp(u.created_at) })));
  addSheet(workbook, 'Présents annoncés', [...PERSON_COLUMNS, { header: 'Confirmé le', key: 'date', width: 20 }, { header: 'QR scanné', key: 'scan', width: 12 }],
    confirmes.map((p) => ({ ...p, date: format.timestamp(p.confirme_at), scan: p.scanne_at ? 'Oui' : 'Non' })));
  addSheet(workbook, 'Présents confirmés (QR)', [...PERSON_COLUMNS, { header: 'Scanné le', key: 'date', width: 20 }],
    presents.map((p) => ({ ...p, date: format.timestamp(p.scanne_at) })));

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildEventWorkbook };
