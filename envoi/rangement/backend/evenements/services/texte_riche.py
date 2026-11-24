"""
Le texte mis en forme (gras, souligné, couleur, lien) que l'administrateur écrit dans le formulaire de l'événement.

nettoyer()  : ne garde que la mise en forme autorisée (jamais de script) : c'est ce qui est enregistré et envoyé par e-mail ;
en_texte()  : la même chose en texte simple, pour la version texte de l'e-mail.
"""
import re
from html import escape, unescape
from html.parser import HTMLParser

BALISES = {"b", "strong", "i", "em", "u", "br", "p", "div", "span", "a", "ul", "ol", "li", "font"}
COULEUR = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]{3,20})$")
LIEN = re.compile(r"^(https?://|mailto:|tel:)", re.IGNORECASE)
VIDES = {"br"}


class _Nettoyeur(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sortie = []
        self.ouvertes = []

    def handle_starttag(self, balise, attributs):
        if balise not in BALISES:
            return
        attrs = dict(attributs)
        texte = ""
        if balise == "a":
            href = (attrs.get("href") or "").strip()
            if not LIEN.match(href):
                return
            texte = f' href="{escape(href, quote=True)}"'
        elif balise == "font":
            if attrs.get("color") and COULEUR.match(attrs["color"].strip()):
                balise, texte = "span", f' style="color:{attrs["color"].strip()}"'
            else:
                return
        elif balise in ("span", "p", "div", "li"):
            styles = []
            for morceau in (attrs.get("style") or "").split(";"):
                if ":" not in morceau:
                    continue
                cle, valeur = (m.strip() for m in morceau.split(":", 1))
                if cle.lower() in ("color", "background-color") and COULEUR.match(valeur):
                    styles.append(f"{cle.lower()}:{valeur}")
                elif cle.lower() == "font-weight" and valeur in ("bold", "700"):
                    styles.append("font-weight:bold")
                elif cle.lower() in ("text-decoration", "text-decoration-line") and "underline" in valeur:
                    styles.append("text-decoration:underline")
                elif cle.lower() == "text-align" and valeur in ("left", "center", "right"):
                    styles.append(f"text-align:{valeur}")
            if styles:
                texte = f' style="{";".join(styles)}"'
        self.sortie.append(f"<{balise}{texte}>")
        if balise not in VIDES:
            self.ouvertes.append(balise)

    def handle_endtag(self, balise):
        if balise == "font":
            balise = "span"
        if balise in self.ouvertes:
            while self.ouvertes:
                derniere = self.ouvertes.pop()
                self.sortie.append(f"</{derniere}>")
                if derniere == balise:
                    break

    def handle_data(self, donnees):
        self.sortie.append(escape(donnees, quote=False))

    def fermer(self):
        while self.ouvertes:
            self.sortie.append(f"</{self.ouvertes.pop()}>")
        return "".join(self.sortie)


def nettoyer(html):
    """Le HTML reçu, réduit à la mise en forme autorisée."""
    if not html or not html.strip():
        return ""
    analyseur = _Nettoyeur()
    analyseur.feed(html)
    analyseur.close()
    resultat = analyseur.fermer().strip()
    return "" if not en_texte(resultat) else resultat


def en_texte(html):
    """Le texte simple : les retours à la ligne sont gardés, la mise en forme disparaît."""
    texte = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", html or "", flags=re.IGNORECASE)
    texte = re.sub(r"<[^>]+>", "", texte)
    return re.sub(r"\n{3,}", "\n\n", unescape(texte)).strip()
