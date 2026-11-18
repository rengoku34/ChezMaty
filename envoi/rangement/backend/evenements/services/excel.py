"""
L'export EXCEL : la liste des inscrits d'UN événement, avec la colonne « Présent » (Vrai ou Faux).
Un fichier = un événement : les événements ne sont jamais mélangés.
On utilise la bibliothèque openpyxl, qui fabrique de vrais fichiers .xlsx.
"""
import io
import re

from django.utils.text import slugify
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

TYPE_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Les colonnes : (titre, largeur).
COLONNES = [
    ("Nom", 22), ("Prénom", 22), ("Filiale", 24), ("Adresse e-mail", 34),
    ("Numéro de téléphone", 22), ("Créneau", 14), ("Présent", 10),
]


def nom_fichier(evenement):
    """Un nom de fichier propre, par exemple : inscrits-conference-octobre-rose-2026-10-24.xlsx"""
    base = slugify(evenement.nom) or "evenement"
    return f"inscrits-{base}-{evenement.date:%Y-%m-%d}.xlsx"


def _nom_feuille(evenement):
    """Excel limite le nom d'une feuille à 31 caractères et interdit  \\ / ? * [ ] :"""
    return re.sub(r"[\\/?*\[\]:]", " ", evenement.nom).strip()[:31] or "Inscrits"


def construire_classeur(evenement, inscriptions):
    """Fabrique le fichier Excel d'un événement et le renvoie sous forme d'octets (prêt à être téléchargé)."""
    classeur = Workbook()
    feuille = classeur.active
    feuille.title = _nom_feuille(evenement)
    feuille.append([titre for titre, _ in COLONNES])
    for i in inscriptions.order_by("nom", "prenom"):
        feuille.append([
            i.nom, i.prenom, i.filiale, i.email, i.telephone, i.creneau,
            "Vrai" if i.present else "Faux",              # la colonne vrai / faux demandée
        ])
    for numero, (_, largeur) in enumerate(COLONNES):
        feuille.column_dimensions[chr(65 + numero)].width = largeur       # A, B, C...
    for cellule in feuille[1]:                                             # en-tête en bleu
        cellule.font = Font(bold=True, color="FFFFFFFF")
        cellule.fill = PatternFill("solid", fgColor="FF26246A")
    feuille.freeze_panes = "A2"                                            # la première ligne reste visible
    if feuille.max_row > 1:
        feuille.auto_filter.ref = feuille.dimensions                       # filtres automatiques

    tampon = io.BytesIO()                                                  # un « fichier » en mémoire
    classeur.save(tampon)
    return tampon.getvalue()
