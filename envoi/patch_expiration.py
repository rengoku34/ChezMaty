"""Ajoute l'expiration des liens d'inscription (fin du dernier créneau, ou minuit sans créneau)."""
import sys

MODIFS = {
    "evenements/models.py": "tolerant",
    "evenements/serializers.py": [
        ('''    nombre_presents = serializers.SerializerMethodField()

    class Meta:
        model = Evenement
        fields = [
            "id", "nom", "date", "description", "lieu", "creneaux",
            "lien", "url_inscription", "nombre_inscrits", "nombre_presents", "cree_le",
        ]''', '''    nombre_presents = serializers.SerializerMethodField()
    inscriptions_ouvertes = serializers.BooleanField(read_only=True)

    class Meta:
        model = Evenement
        fields = [
            "id", "nom", "date", "description", "lieu", "creneaux",
            "lien", "url_inscription", "inscriptions_ouvertes", "nombre_inscrits", "nombre_presents", "cree_le",
        ]'''),
    ],
    "evenements/pages.py": "tolerant",
    "evenements/views.py": [
        ('''        evenement = self.get_object()
        diffusion = adresses_diffusion()
        if not diffusion:''', '''        evenement = self.get_object()
        if not evenement.inscriptions_ouvertes:
            return Response({"detail": "Cet événement est terminé : le lien d'inscription a expiré."}, status=status.HTTP_400_BAD_REQUEST)
        diffusion = adresses_diffusion()
        if not diffusion:'''),
        ('''    def create(self, request, *args, **kwargs):
        try:
            reponse = super().create''', '''    def create(self, request, *args, **kwargs):
        if not get_object_or_404(Evenement, lien=self.kwargs["lien"]).inscriptions_ouvertes:
            return Response({"detail": "Les inscriptions sont closes : ce lien a expiré."}, status=status.HTTP_410_GONE)
        try:
            reponse = super().create'''),
    ],
    "web/app.js": [
        ('''      h("td", {}, h("strong", {}, e.nom)),
      h("td", {}, formaterDate(e.date)),''', '''      h("td", {}, h("strong", {}, e.nom), e.inscriptions_ouvertes ? null : h("span", { class: "badge non", style: "margin-left:.5rem" }, "Terminé")),
      h("td", {}, formaterDate(e.date)),'''),
        ('disabled: diffusion.length === 0, onclick', 'disabled: diffusion.length === 0 || !evenement.inscriptions_ouvertes, onclick'),
        ('''      h("p", { class: "muted", style: "margin:0 0 .8rem" }, diffusion.length
        ? "Le lien''', '''      h("p", { class: "muted", style: "margin:0 0 .8rem" }, !evenement.inscriptions_ouvertes
        ? "Cet événement est terminé : le lien d'inscription a expiré."
        : diffusion.length
        ? "Le lien'''),
        ('''      h("div", { class: "carte" }, h("h2", {}, "Lien d'inscription"),
        h("div", { class: "lien-inscription" }''', '''      h("div", { class: "carte" }, h("h2", {}, "Lien d'inscription"),
        evenement.inscriptions_ouvertes ? null : h("div", { class: "alerte" }, "Ce lien a expiré : l'événement est terminé, plus personne ne peut s'inscrire."),
        h("div", { class: "lien-inscription" }'''),
    ],
}

PAGE_EXPIREE = """{% extends 'base.html' %}
{# PUBLIC : le lien d'inscription a expiré (l'événement est terminé). #}
{% block nav %}{% endblock %}
{% block content %}
<section class="card">
  <h1>Lien expiré</h1>
  <p>Les inscriptions à « {{ evenement.nom }} » sont closes : l'événement a eu lieu le {{ evenement.date|date:"l j F Y" }}.</p>
  <p class="hint">Pour toute question, rapprochez-vous de l'organisateur.</p>
</section>
{% endblock %}
"""

def apres_ligne(texte, repere, ajout, apres=0):
    """Insère `ajout` juste après la première ligne qui contient `repere` (en cherchant à partir de la position `apres`)."""
    debut = texte.find(repere, apres)
    if debut < 0:
        raise ValueError(repere)
    fin_ligne = texte.find("\n", debut) + 1
    return texte[:fin_ligne] + ajout + texte[fin_ligne:]


def modifier_models(texte):
    texte = apres_ligne(texte, "import string", "from datetime import datetime, time, timedelta\nfrom django.utils import timezone\n")
    return apres_ligne(texte, "/e/{self.lien}/", '''
    @property
    def fin(self):
        """Le moment où les inscriptions se ferment : la fin du dernier créneau, ou minuit (fin du jour J) s'il n'y a pas de créneau."""
        if self.creneaux:
            heures, minutes = max(creneau.split("-")[1] for creneau in self.creneaux).split(":")
            moment = datetime.combine(self.date, time(int(heures), int(minutes)))
        else:
            moment = datetime.combine(self.date + timedelta(days=1), time(0, 0))
        return timezone.make_aware(moment)

    @property
    def inscriptions_ouvertes(self):
        """Vrai tant que l'événement n'est pas terminé : ensuite, le lien d'inscription a expiré."""
        return timezone.now() < self.fin
''')


def modifier_pages(texte):
    verification = "    if not evenement.inscriptions_ouvertes:\n        return page_lien_expire(request, evenement)\n"
    for fonction in ("def evenement_formulaire(request, lien):", "def evenement_accueil(request, lien):"):
        debut = texte.index(fonction)
        texte = apres_ligne(texte, "get_object_or_404(Evenement, lien=lien)", verification, debut)
    page = '''def page_lien_expire(request, evenement):
    """La page affichée quand l'événement est terminé : le lien d'inscription a expiré."""
    return render(request, "public/expire.html", {"title": "Lien expiré", "evenement": evenement}, status=410)


'''
    debut = texte.index("def evenement_accueil(request, lien):")
    return texte[:debut] + page + texte[debut:]


OUTILS = {"evenements/models.py": modifier_models, "evenements/pages.py": modifier_pages}

nouveaux = {}
deja = 0
for chemin, paires in MODIFS.items():
    try:
        with open(chemin, encoding="utf-8-sig") as f:
            texte = f.read()
    except FileNotFoundError:
        sys.exit(f"ARRET : fichier introuvable : {chemin} (lance ce script depuis le dossier du projet).")
    if "inscriptions_ouvertes" in texte:
        deja += 1
        continue
    if paires == "tolerant":
        try:
            texte = OUTILS[chemin](texte)
        except ValueError as erreur:
            sys.exit(f"ARRET : {chemin} n'a pas le contenu attendu (introuvable : {erreur}). Rien n'a ete modifie.")
    else:
        for ancien, nouveau in paires:
            if ancien not in texte:
                sys.exit(f"ARRET : {chemin} n'a pas le contenu attendu (début : {ancien[:50]!r}). Rien n'a ete modifie.")
            texte = texte.replace(ancien, nouveau, 1)
    nouveaux[chemin] = texte

if deja == len(MODIFS):
    sys.exit("Deja applique : rien a faire.")
if deja:
    sys.exit("ARRET : certains fichiers sont deja modifies, d'autres non. Rien n'a ete modifie.")

for chemin, texte in nouveaux.items():
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(texte)
with open("templates/public/expire.html", "w", encoding="utf-8") as f:
    f.write(PAGE_EXPIREE)
print("OK : expiration des liens ajoutee (5 fichiers modifies, 1 page creee).")
