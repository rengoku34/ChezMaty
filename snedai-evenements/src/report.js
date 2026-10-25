const PDFDocument = require('pdfkit');

const NAVY = '#26246a';
const ORANGE = '#f08a46';
const GREY = '#62647a';
const LINE = '#dcdde6';
const MARGIN = 50;

// Rapport PDF d'un événement, prêt à transmettre à la direction : chiffres clés, taux,
// participation par filiale, liste des présents et des personnes annoncées non venues.
function buildEventReport({ event, inscrits, confirmes, presents, filiales, rates, format, logoPath, generatedAt = new Date() }) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: `Rapport – ${event.titre}`, Author: 'Événements SNEDAI' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - MARGIN * 2;

  // En-tête
  if (logoPath) doc.image(logoPath, MARGIN, 40, { height: 34 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text('Rapport d’événement', MARGIN, 46, { width, align: 'right' });
  doc.moveTo(MARGIN, 86).lineTo(MARGIN + width, 86).lineWidth(2).strokeColor(ORANGE).stroke();

  // Événement
  doc.y = 104;
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1d1d2b').text(event.titre, MARGIN, doc.y, { width });
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(GREY);
  const when = format.eventRange(event.debut, event.fin);
  if (when) doc.text(`Date : ${when}`);
  if (event.lieu) doc.text(`Lieu : ${event.lieu}`);
  doc.text(`Statut : ${event.termine_at ? `terminé le ${format.timestamp(event.termine_at)}` : 'en cours'}`);

  // Chiffres clés
  doc.moveDown(1);
  const boxY = doc.y;
  const boxW = (width - 20) / 3;
  const kpis = [
    ['Inscrits sur le site', inscrits.length, NAVY],
    ['Ont dit « je serai présent(e) »', confirmes.length, ORANGE],
    ['Étaient là (QR scanné)', presents.length, '#17703a'],
  ];
  kpis.forEach(([label, value, color], i) => {
    const x = MARGIN + i * (boxW + 10);
    doc.rect(x, boxY, boxW, 62).lineWidth(1).strokeColor(LINE).stroke();
    doc.rect(x, boxY, boxW, 3).fillColor(color).fill();
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1d1d2b').text(String(value), x + 12, boxY + 12, { width: boxW - 24 });
    doc.font('Helvetica').fontSize(9).fillColor(GREY).text(label, x + 12, boxY + 42, { width: boxW - 24 });
  });
  doc.y = boxY + 76;
  const pct = (v) => (v === null ? '—' : `${v} %`);
  doc.font('Helvetica').fontSize(10).fillColor('#1d1d2b')
    .text(`Taux de réponse : ${pct(rates.reponse)} des inscrits ont dit qu’ils seraient présents.`, MARGIN, doc.y, { width })
    .text(`Taux de présence : ${pct(rates.presence)} des personnes annoncées étaient vraiment là.`, { width });

  // Par filiale
  section(doc, 'Participation par filiale');
  table(doc, [
    { header: 'Filiale', width: 0.36, value: (r) => r.filiale },
    { header: 'Inscrits', width: 0.14, value: (r) => r.inscrits, align: 'right' },
    { header: 'Ont dit oui', width: 0.16, value: (r) => r.confirmes, align: 'right' },
    { header: 'Étaient là', width: 0.16, value: (r) => r.presents, align: 'right' },
    { header: 'Présence', width: 0.18, value: (r) => pct(r.presence), align: 'right' },
  ], filiales);

  // Listes nominatives
  const person = [
    { header: 'Nom', width: 0.2, value: (r) => r.nom },
    { header: 'Prénom', width: 0.2, value: (r) => r.prenom },
    { header: 'Filiale', width: 0.22, value: (r) => r.filiale },
    { header: 'Adresse e-mail', width: 0.38, value: (r) => r.email },
  ];
  section(doc, `Présents – QR code scanné (${presents.length})`);
  table(doc, person, presents);
  const absents = confirmes.filter((p) => !p.scanne_at);
  section(doc, `Annoncés mais non venus (${absents.length})`);
  table(doc, person, absents);

  // Pied de page sur chaque page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // le pied de page est sous la marge : sans cela pdfkit ouvrirait une page
    const y = doc.page.height - 36;
    doc.font('Helvetica').fontSize(8).fillColor(GREY)
      .text(`Événements SNEDAI — rapport généré le ${format.timestamp(generatedAt.toISOString())}`, MARGIN, y, { width, lineBreak: false })
      .text(`Page ${i + 1} / ${range.count}`, MARGIN, y, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;

  function section(d, title) {
    if (d.y > d.page.height - 160) d.addPage();
    d.moveDown(1.4);
    d.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(title, MARGIN, d.y, { width });
    d.moveDown(0.4);
  }

  function table(d, columns, rows) {
    const rowH = 18;
    const bottom = d.page.height - 60;
    // Chaque cellule est placée à la hauteur de sa ligne (pdfkit avance d.y après chaque texte).
    const drawCells = (y, values) => {
      let x = MARGIN;
      columns.forEach((col, i) => {
        d.text(values[i], x + 6, y + 5, { width: col.width * width - 12, align: col.align || 'left', lineBreak: false, ellipsis: true });
        x += col.width * width;
      });
      d.y = y + rowH;
    };
    const drawHeader = () => {
      const y = d.y;
      d.rect(MARGIN, y, width, rowH).fillColor(NAVY).fill();
      d.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
      drawCells(y, columns.map((col) => col.header.toUpperCase()));
    };
    if (!rows.length) {
      d.font('Helvetica').fontSize(9.5).fillColor(GREY).text('Personne.', MARGIN, d.y, { width });
      return;
    }
    if (d.y + rowH * 2 > bottom) d.addPage();
    drawHeader();
    rows.forEach((row, index) => {
      if (d.y + rowH > bottom) {
        d.addPage();
        drawHeader();
      }
      const y = d.y;
      if (index % 2 === 1) d.rect(MARGIN, y, width, rowH).fillColor('#f6f6fa').fill();
      d.font('Helvetica').fontSize(9).fillColor('#1d1d2b');
      drawCells(y, columns.map((col) => String(col.value(row) ?? '')));
    });
    d.x = MARGIN;
  }
}

module.exports = { buildEventReport };
