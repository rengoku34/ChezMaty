"""Rapport PDF d'un événement, prêt à transmettre à la direction : chiffres clés, taux, filiales, présents et absents."""
import io
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .formatting import timestamp

NAVY = colors.HexColor('#26246a')
ORANGE = colors.HexColor('#f08a46')
GREY = colors.HexColor('#62647a')
LINE = colors.HexColor('#dcdde6')
INK = colors.HexColor('#1d1d2b')
GREEN = colors.HexColor('#17703a')

LOGO = next((p for p in (Path(settings.BASE_DIR) / 'static/img/logo.png', Path(settings.BASE_DIR) / 'static/img/logo.jpg') if p.exists()), None)

H1 = ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=18, textColor=INK, leading=22)
META = ParagraphStyle('meta', fontName='Helvetica', fontSize=10, textColor=GREY, leading=14)
BODY = ParagraphStyle('body', fontName='Helvetica', fontSize=10, textColor=INK, leading=14)
SECTION = ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=12, textColor=NAVY, leading=16, spaceBefore=16, spaceAfter=6)
CELL = ParagraphStyle('cell', fontName='Helvetica', fontSize=9, textColor=INK, leading=11)
CELL_RIGHT = ParagraphStyle('cell-right', parent=CELL, alignment=2)


def _pct(value):
    return '—' if value is None else f'{value} %'


def _escape(value):
    return str(value if value is not None else '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _table(headers, rows, widths, right=()):
    data = [[Paragraph(f'<font color="white"><b>{_escape(h).upper()}</b></font>', ParagraphStyle('th', parent=CELL, fontSize=8.5, alignment=2 if i in right else 0)) for i, h in enumerate(headers)]]
    for row in rows:
        data.append([Paragraph(_escape(v), CELL_RIGHT if i in right else CELL) for i, v in enumerate(row)])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f6f6fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return table


def build_event_report(event, inscrits, confirmes, presents, filiales, rates):
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
                                 title=f'Rapport – {event.titre}', author='Événements SNEDAI')
    width = A4[0] - 36 * mm
    generated = timestamp(timezone.now())

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(GREY)
        canvas.drawString(18 * mm, 10 * mm, f'Événements SNEDAI — rapport généré le {generated}')
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Page {doc.page}')
        canvas.restoreState()

    story = []
    head = [[Image(str(LOGO), height=11 * mm, width=11 * mm * 2.6, kind='proportional') if LOGO else '', Paragraph('<b>Rapport d’événement</b>', ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=16, textColor=NAVY, alignment=2))]]
    header = Table(head, colWidths=[width / 2, width / 2])
    header.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LINEBELOW', (0, 0), (-1, 0), 2, ORANGE), ('BOTTOMPADDING', (0, 0), (-1, -1), 8), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    story += [header, Spacer(1, 12), Paragraph(_escape(event.titre), H1), Spacer(1, 3)]
    if event.range_text:
        story.append(Paragraph(f'Date : {_escape(event.range_text)}', META))
    if event.lieu:
        story.append(Paragraph(f'Lieu : {_escape(event.lieu)}', META))
    story.append(Paragraph(f'Statut : {"terminé le " + timestamp(event.termine_at) if event.termine_at else "en cours"}', META))
    story.append(Spacer(1, 14))

    box = (width - 20) / 3
    kpis = [('Inscrits sur le site', len(inscrits), NAVY), ('Ont dit « je serai présent(e) »', len(confirmes), ORANGE), ('Étaient là (QR scanné)', len(presents), GREEN)]
    cells = [[[Paragraph(f'<b>{value}</b>', ParagraphStyle('k', fontName='Helvetica-Bold', fontSize=22, leading=26, textColor=INK)), Paragraph(label, ParagraphStyle('kl', parent=META, fontSize=9))] for label, value, _ in kpis]]
    stats = Table(cells, colWidths=[box, box, box], hAlign='LEFT')
    style = [('BOX', (i, 0), (i, 0), 0.8, LINE) for i in range(3)] + [('LINEABOVE', (i, 0), (i, 0), 3, kpis[i][2]) for i in range(3)]
    stats.setStyle(TableStyle(style + [('LEFTPADDING', (0, 0), (-1, -1), 10), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    story += [stats, Spacer(1, 10)]
    story.append(Paragraph(f'Taux de réponse : {_pct(rates["reponse"])} des inscrits ont dit qu’ils seraient présents.', BODY))
    story.append(Paragraph(f'Taux de présence : {_pct(rates["presence"])} des personnes annoncées étaient vraiment là.', BODY))

    story.append(Paragraph('Participation par filiale', SECTION))
    if filiales:
        story.append(_table(['Filiale', 'Inscrits', 'Ont dit oui', 'Étaient là', 'Présence'],
                            [[f['filiale'], f['inscrits'], f['confirmes'], f['presents'], _pct(f['presence'])] for f in filiales],
                            [width * x for x in (0.36, 0.14, 0.16, 0.16, 0.18)], right=(1, 2, 3, 4)))
    else:
        story.append(Paragraph('Personne.', META))

    def people(title, rows):
        story.append(Paragraph(title, SECTION))
        if not rows:
            story.append(Paragraph('Personne.', META))
            return
        story.append(_table(['Nom', 'Prénom', 'Filiale', 'Adresse e-mail'], [[p.user.nom, p.user.prenom, p.user.filiale, p.user.email] for p in rows],
                            [width * x for x in (0.2, 0.2, 0.22, 0.38)]))

    people(f'Présents – QR code scanné ({len(presents)})', presents)
    absents = [p for p in confirmes if not p.scanne_at]
    people(f'Annoncés mais non venus ({len(absents)})', absents)

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
