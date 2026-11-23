"""
Range le projet SNEDAI : backend / web / mobile (Flutter) / livrables / docs, servi par UN seul serveur (runserver).

Lancer depuis le dossier du projet (celui qui contient .venv) :
    .\\.venv\\Scripts\\python.exe chemin\\vers\\reorganiser.py
Les fichiers a installer (mobile_flutter, urls.py, README.md, architecture.md) doivent se trouver a cote de ce script.
Le script peut etre relance sans danger : il ne refait que ce qui manque.
"""
import os
import re
import shutil
import subprocess
import sys

RACINE = os.getcwd()
ICI = os.path.dirname(os.path.abspath(__file__))


def chemin(*morceaux):
    return os.path.join(RACINE, *morceaux)


def ici(*morceaux):
    return os.path.join(ICI, *morceaux)


def lire(c):
    with open(c, encoding="utf-8-sig") as f:
        return f.read().replace("\r\n", "\n")


def ecrire(c, texte):
    os.makedirs(os.path.dirname(c), exist_ok=True)
    with open(c, "w", encoding="utf-8", newline="") as f:
        f.write(texte)


def remplacer(texte, ancien, nouveau, nom):
    if ancien not in texte:
        sys.exit(f"ARRET : {nom} n'a pas le contenu attendu (introuvable : {ancien[:70]!r}). Copie ce message, je le regle.")
    return texte.replace(ancien, nouveau, 1)


def etape(titre):
    print(f"\n=== {titre}")


# ------------------------------------------------------------------ 0. verifications
flutter = shutil.which("flutter")
if not flutter:
    sys.exit("ARRET : la commande flutter est introuvable. Ouvre un terminal ou 'flutter --version' fonctionne, puis relance ce script.")
for fichier in (("README.md",), ("architecture.md",), ("mobile_flutter", "pubspec.yaml"), ("mobile_flutter", "lib", "main.dart"), ("mobile_flutter", "android", "MainActivity.java"),
                ("backend", "evenements", "models.py"), ("backend", "evenements", "migrations", "0007_limite_et_places.py"),
                ("backend", "config", "urls.py"), ("web", "app.js")):
    if not os.path.exists(ici(*fichier)):
        sys.exit(f"ARRET : le fichier {os.path.join(*fichier)} manque a cote du script.")

a_ranger = os.path.exists(chemin("manage.py"))
if not a_ranger and not os.path.isdir(chemin("backend")):
    sys.exit("ARRET : manage.py et backend introuvables. Lance ce script depuis le dossier du projet.")

# ------------------------------------------------------------------ 1. le backend dans son dossier
etape("1. Le backend dans le dossier backend")
try:
    if a_ranger:
        os.makedirs(chemin("backend"), exist_ok=True)
        for nom in ("manage.py", "config", "evenements", "templates", "static", "db.sqlite3"):
            if os.path.exists(chemin(nom)):
                shutil.move(chemin(nom), chemin("backend", nom))
        print("  fait : manage.py, config, evenements, templates, static, base de donnees")
    else:
        print("  deja fait")

    # ------------------------------------------------------------------ 2. l'ancien mobile (page web + application Android) est mis de cote
    etape("2. L'ancien mobile (page web + coque Android) est mis de cote, hors du projet")
    ancien_mobile = chemin("mobile") if os.path.isdir(chemin("mobile")) and not os.path.exists(chemin("mobile", "pubspec.yaml")) else None
    ancien_zebra = chemin("zebra") if os.path.isdir(chemin("zebra")) else None
    if ancien_mobile or ancien_zebra:
        os.makedirs(chemin("_icones"), exist_ok=True)
        for source in (chemin("mobile", "android", "res"), chemin("zebra", "res")):
            for densite in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
                icone = os.path.join(source, f"mipmap-{densite}", "ic_launcher.png")
                if os.path.exists(icone) and not os.path.exists(chemin("_icones", f"{densite}.png")):
                    shutil.copy(icone, chemin("_icones", f"{densite}.png"))
        parent = os.path.dirname(RACINE)
        destination = os.path.join(parent, "ancien-mobile-snedai")
        numero = 2
        while os.path.exists(destination):
            destination = os.path.join(parent, f"ancien-mobile-snedai-{numero}")
            numero += 1
        os.makedirs(destination)
        for dossier in (ancien_mobile, ancien_zebra):
            if dossier:
                shutil.move(dossier, os.path.join(destination, os.path.basename(dossier)))
        print(f"  fait : l'ancien mobile est dans {destination} (la cle snedai.keystore y est, garde-la)")
    else:
        print("  rien a mettre de cote")
except PermissionError as erreur:
    sys.exit(f"ARRET : un fichier est utilise ({erreur}). Arrete le serveur (Ctrl+C), ferme les terminaux qui font tourner le site, puis relance ce script.")

# ------------------------------------------------------------------ 3. le backend a jour (code, e-mails, lieux, jeton) et ses reglages
etape("3. Le backend a jour : lieux, jeton qui expire, e-mails, page de remerciement")
reglages = lire(chemin("backend", "config", "settings.py"))
if "Ã" in reglages or "Â" in reglages:        # accents abimes (UTF-8 relu en Windows-1252, par exemple par Get-Content/Set-Content) : on les repare
    try:
        reglages = reglages.encode("cp1252").decode("utf-8")
        print("  fait : les accents de settings.py sont repares")
    except (UnicodeEncodeError, UnicodeDecodeError):
        print("  ATTENTION : settings.py contient des accents abimes que le script ne sait pas reparer seul.")
duree = re.search(r"^JETON_DUREE_HEURES\s*=\s*(\d+)", reglages, re.MULTILINE)
duree = duree.group(1) if duree else "12"                                 # une duree deja choisie est conservee
lignes = [l for l in reglages.split("\n")
          if "CorsMiddleware" not in l
          and not l.startswith(("CORS_", "DOSSIER_", "JETON_DUREE_HEURES", 'REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"]',
                                'SPECTACULAR_SETTINGS["AUTHENTICATION_WHITELIST"]', "# --- Les trois dossiers du projet",
                                "# --- Les dossiers du projet", "# --- La duree de vie du jeton", "# --- Les places limitees",
                                "import django", "if django.VERSION", '    DATABASES["default"].setdefault'))]
ecrire(chemin("backend", "config", "settings.py"), "\n".join(lignes).rstrip("\n") + f'''

# --- La duree de vie du jeton de connexion : passe ce delai (en heures), il faut se reconnecter ---
JETON_DUREE_HEURES = {duree}
REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] = ["evenements.authentification.JetonExpirant", "rest_framework.authentication.SessionAuthentication"]
SPECTACULAR_SETTINGS["AUTHENTICATION_WHITELIST"] = ["evenements.authentification.JetonExpirant"]

# --- Les places limitees : des inscriptions envoyees au meme instant sont traitees l'une apres l'autre (jamais une place en trop) ---
import django
if django.VERSION >= (5, 1):
    DATABASES["default"].setdefault("OPTIONS", {{}})["transaction_mode"] = "IMMEDIATE"

# --- Les dossiers du projet : le meme serveur sert l'application web et le fichier d'installation de l'application mobile ---
DOSSIER_WEB = BASE_DIR.parent / "web"
DOSSIER_LIVRABLES = BASE_DIR.parent / "livrables"       # le fichier d'installation de l'application mobile (snedai-scan.apk)
''')
if os.path.exists(chemin("backend", "templates", "public", "evenement.html")):      # le lien ouvre directement le formulaire : cette page n'existe plus
    os.remove(chemin("backend", "templates", "public", "evenement.html"))
if os.path.exists(chemin("backend", "templates", "admin", "base_site.html")):       # le back-office redevient l'administration Django simple (sans logo)
    os.remove(chemin("backend", "templates", "admin", "base_site.html"))
for ancien in ("api", "pages"):                                   # la version decoupee en sous-dossiers est remplacee par la version simple
    shutil.rmtree(chemin("backend", "evenements", ancien), ignore_errors=True)
for dossier in ("evenements", "templates", "static"):
    shutil.copytree(ici("backend", dossier), chemin("backend", dossier), dirs_exist_ok=True)
shutil.copy(ici("backend", "config", "urls.py"), chemin("backend", "config", "urls.py"))
shutil.copy(ici("backend", "manage.py"), chemin("backend", "manage.py"))        # « manage.py runserver » seul suffit (ecoute sur tout le reseau)
print(f"  fait : evenements, templates, static, urls.py, reglages (jeton : {duree} heures)")

# ------------------------------------------------------------------ 4. l'application web a jour
etape("4. L'application web a jour : lieux, selecteurs de date et d'heure, liens relatifs vers l'API")
for ancien in ("js", "css", "img"):
    shutil.rmtree(chemin("web", ancien), ignore_errors=True)
shutil.copytree(ici("web"), chemin("web"), dirs_exist_ok=True)
print("  fait : web/ (app.js, style.css, index.html)")

# ------------------------------------------------------------------ 5. documentation, livrables, nettoyage
etape("5. Documentation, livrables et nettoyage")
shutil.copy(ici("README.md"), chemin("README.md"))
os.makedirs(chemin("docs"), exist_ok=True)
shutil.copy(ici("architecture.md"), chemin("docs", "architecture.md"))
os.makedirs(chemin("livrables"), exist_ok=True)
for fichier in (("backend", "evenements", "cors.py"), ("lancer.ps1",), ("arreter.ps1",), ("serveurs.pid",), ("outils", "mettre_a_jour_settings.py")):
    if os.path.exists(chemin(*fichier)):
        os.remove(chemin(*fichier))
for dossier in ("logs", "outils"):
    if os.path.isdir(chemin(dossier)) and not (dossier == "outils" and os.listdir(chemin(dossier))):
        shutil.rmtree(chemin(dossier), ignore_errors=True)
print("  fait : README.md, docs/architecture.md, dossier livrables ; plus de cors.py, lancer.ps1, arreter.ps1")

# ------------------------------------------------------------------ 6. l'application mobile Flutter
etape("6. L'application mobile Flutter (code, lecteur Zebra, configuration Android)")
mobile = chemin("mobile")
os.makedirs(mobile, exist_ok=True)
if not os.path.exists(os.path.join(mobile, "android")):
    resultat = subprocess.run([flutter, "create", "--org", "ci.snedai", "--project-name", "snedai_scan",
                               "--platforms", "android", "--no-pub", "."], cwd=mobile)
    if resultat.returncode != 0:
        sys.exit("ARRET : 'flutter create' a echoue (voir le message ci-dessus). Corrige le probleme puis relance ce script.")
for nom in ("lib", "test", "assets"):
    if os.path.isdir(os.path.join(mobile, nom)):
        shutil.rmtree(os.path.join(mobile, nom))
    shutil.copytree(ici("mobile_flutter", nom), os.path.join(mobile, nom))
for nom in ("pubspec.yaml", "analysis_options.yaml", "README.md"):
    shutil.copy(ici("mobile_flutter", nom), os.path.join(mobile, nom))

manifeste = os.path.join(mobile, "android", "app", "src", "main", "AndroidManifest.xml")
texte = lire(manifeste)
if "android.permission.INTERNET" not in texte:
    texte = re.sub(r"(<manifest[^>]*>)", r'\1\n    <uses-permission android:name="android.permission.INTERNET"/>', texte, count=1)
if "usesCleartextTraffic" not in texte:
    texte = re.sub(r"<application\b", '<application\n        android:usesCleartextTraffic="true"', texte, count=1)
texte = re.sub(r'android:label="[^"]*"', 'android:label="SNEDAI Scan"', texte, count=1)
ecrire(manifeste, texte)
for densite in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
    icone = chemin("_icones", f"{densite}.png")
    if os.path.exists(icone):
        shutil.copy(icone, os.path.join(mobile, "android", "app", "src", "main", "res", f"mipmap-{densite}", "ic_launcher.png"))

# L'activite Android : version Java qui relie le lecteur du Zebra (DataWedge) a l'application. Elle remplace celle de Kotlin.
racine_kotlin = os.path.join(mobile, "android", "app", "src", "main", "kotlin")
for dossier, _, fichiers in os.walk(racine_kotlin):
    for fichier in fichiers:
        if fichier == "MainActivity.kt":
            os.remove(os.path.join(dossier, fichier))
dossier_java = os.path.join(mobile, "android", "app", "src", "main", "java", "ci", "snedai", "snedai_scan")
os.makedirs(dossier_java, exist_ok=True)
shutil.copy(ici("mobile_flutter", "android", "MainActivity.java"), os.path.join(dossier_java, "MainActivity.java"))
print("  fait : sources Flutter, lecteur Zebra (MainActivity.java), configuration Android (HTTP local, internet, nom et icone)")
shutil.rmtree(chemin("_icones"), ignore_errors=True)

# ------------------------------------------------------------------ 7. verifications
etape("7. Verifications")
echecs = []
for titre, commande in (("flutter pub get", ["pub", "get"]), ("flutter analyze", ["analyze", "--no-fatal-infos"]), ("flutter test", ["test"])):
    print(f"\n--- {titre}")
    sys.stdout.flush()
    if subprocess.run([flutter] + commande, cwd=mobile).returncode != 0:
        echecs.append(titre)
for titre, commande in (("manage.py migrate (met la base a jour, tes donnees sont conservees)", ["migrate"]), ("manage.py check", ["check"])):
    print(f"\n--- python {titre}")
    sys.stdout.flush()
    if subprocess.run([sys.executable, "manage.py"] + commande, cwd=chemin("backend")).returncode != 0:
        echecs.append(titre.split(" (")[0])

print("\n" + "=" * 70)
if echecs:
    print("A REGARDER : " + ", ".join(echecs) + " (copie-moi les messages ci-dessus).")
else:
    print("TOUT EST BON : projet range et verifie.")
print("Prochaines etapes :")
print("  1. cd backend ; ..\\.venv\\Scripts\\python.exe manage.py runserver 0.0.0.0:8000")
print("  2. cd mobile ; flutter build apk --release")
print("  3. copier mobile\\build\\app\\outputs\\flutter-apk\\app-release.apk dans livrables\\snedai-scan.apk")
sys.exit(1 if echecs else 0)
