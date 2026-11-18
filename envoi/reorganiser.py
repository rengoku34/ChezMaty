"""Range le projet en trois dossiers (backend, web, mobile) et le fait servir par UN seul serveur (runserver)."""
import os
import shutil
import subprocess
import sys

RACINE = os.getcwd()
def chemin(*morceaux):
    return os.path.join(RACINE, *morceaux)

NOUVEAU_URLS = '''"""
La liste des ADRESSES (URL) du projet.

Quand le navigateur demande une adresse, Django parcourt cette liste de haut en bas
et appelle la vue du premier chemin qui correspond.
"""
from django.conf import settings
from django.contrib import admin
from django.contrib.auth.views import LogoutView
from django.urls import include, path, re_path
from django.views.generic import RedirectView
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import routers

from evenements import pages, views

# Le routeur fabrique tout seul les adresses de l'API à partir des viewsets.
router = routers.DefaultRouter()
router.register("evenements", views.EvenementViewSet, basename="evenement")

urlpatterns = [
    path("admin/", admin.site.urls),                                      # le backoffice (comptes et inscriptions)

    # --- Les pages (HTML) que voient les employés ---
    path("e/<str:lien>/", pages.evenement_accueil, name="evenement-accueil"),                 # le lien envoyé aux employés
    path("e/<str:lien>/formulaire/", pages.evenement_formulaire, name="evenement-formulaire"),
    path("billet/<str:jeton>/", pages.billet, name="billet"),                                 # le billet avec le QR code
    path("billet/<str:jeton>/qr.png", pages.billet_png, name="billet-png"),                   # le QR code en image

    # --- Les pages réservées : connexion, déconnexion, scan ---
    path("connexion/", pages.ConnexionView.as_view(), name="connexion"),
    path("deconnexion/", LogoutView.as_view(next_page="/connexion/"), name="deconnexion"),
    path("scan/", pages.scan, name="scan"),                                                   # scanner les QR codes

    # --- L'API ---
    path("api/auth/token/", views.ConnexionJetonView.as_view(), name="api-token"),            # se connecter : obtenir un jeton
    path("api/auth/moi/", views.moi, name="api-moi"),                                         # qui suis-je : nom et rôle
    path("api/auth/deconnexion/", views.deconnexion_jeton, name="api-deconnexion"),           # se déconnecter : supprimer le jeton
    path("api/scan/", views.ScanView.as_view(), name="api-scan"),                             # scanner un QR code
    path("api/public/evenements/<str:lien>/inscriptions/", views.InscriptionPubliqueView.as_view(), name="api-public-inscription"),
    path("api/", include(router.urls)),                                   # /api/evenements/

    # --- La documentation automatique de l'API ---
    path("schema/", SpectacularAPIView.as_view(), name="schema"),                         # le plan de l'API (fichier technique)
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),         # Swagger : tester l'API dans le navigateur

    # --- Les applications : le même serveur sert le web (dossier web) et le mobile (dossier mobile/app) ---
    path("mobile", RedirectView.as_view(url="/mobile/")),
    path("mobile/", serve, {"path": "index.html", "document_root": settings.DOSSIER_MOBILE}),         # l'écran de scan
    re_path(r"^mobile/(?P<path>[\\w.\\-]+)$", serve, {"document_root": settings.DOSSIER_MOBILE}),       # ses fichiers et l'APK du Zebra
    path("", serve, {"path": "index.html", "document_root": settings.DOSSIER_WEB}, name="accueil"),  # l'application de l'administrateur
    re_path(r"^(?P<path>app\\.js|style\\.css|logo\\.png|icon-192\\.png)$", serve, {"document_root": settings.DOSSIER_WEB}),
]
'''

README = '''# Plateforme des événements SNEDAI

Un administrateur crée un événement et envoie le lien d'inscription aux employés. Les employés s'inscrivent et reçoivent
un QR code par e-mail. Les agents scannent ce QR code à l'entrée (Zebra) : la présence est enregistrée.

## Les dossiers

| Dossier | Rôle |
|---|---|
| `backend/` | Le cœur : Django + API (données, règles, e-mails, QR codes, scan, Excel). |
| `web/` | L'application de l'administrateur (HTML, CSS, JavaScript). |
| `mobile/app/` | L'écran de scan des agents (HTML, CSS, JavaScript). |
| `mobile/android/` | Le code de l'application Android installée sur le Zebra. |
| `docs/` | La documentation. |

## Démarrer (un seul serveur)

Dans le dossier `backend` :

```
python manage.py runserver 0.0.0.0:8000
```

Pour arrêter : `Ctrl+C` dans ce terminal. Tout s'arrête.

| Adresse | Ce que c'est |
|---|---|
| `http://localhost:8000/` | L'application web de l'administrateur |
| `http://localhost:8000/mobile/` | L'application de scan |
| `http://localhost:8000/mobile/snedai-scan.apk` | L'installation sur le Zebra |
| `http://localhost:8000/api/` | L'API |
| `http://localhost:8000/docs/` | La documentation de l'API |
| `http://localhost:8000/admin/` | Le backoffice Django (comptes et inscriptions) |

## Réglages (`backend/config/settings.py`)

- `APP_URL` : l'adresse du site dans les liens des e-mails (à mettre à jour si l'adresse IP change).
- `ADRESSES_DIFFUSION` : les destinataires du bouton « Envoyer le lien à tous les employés ».
- Les e-mails utilisent les variables Windows `EMAIL_USER` et `EMAIL_MOT_DE_PASSE` (jamais écrites dans le code).
'''

ARCHI = '''# Architecture

Un seul serveur (`runserver`, port 8000) sert les trois parties :

- **backend** : l'API sous `/api/`, les pages des employés (`/e/...`, `/billet/...`) et le backoffice (`/admin/`).
- **web** : l'application de l'administrateur, à la racine `/`.
- **mobile** : l'écran de scan, sous `/mobile/`.

Les applications web et mobile ne gardent aucune donnée : elles appellent l'API par des liens relatifs (`/api/...`).

Rôles : l'administrateur est un compte « staff », l'agent de scan appartient au groupe « Agents de scan », l'employé n'a pas de compte.
'''

LISEZMOI = '''Application « SNEDAI Scan » pour le Zebra (Android 5.0 et plus)
================================================================

Le fichier à installer est mobile\\app\\snedai-scan.apk (le serveur le met aussi à disposition à /mobile/snedai-scan.apk).

Ce dossier contient le code source de l'application :
  AndroidManifest.xml          l'identité de l'application, ses permissions et son icône
  src\\ci\\snedai\\scan\\MainActivity.java   le code (une seule classe)
  assets\\                      les pages affichées pendant la recherche du serveur ou en cas d'erreur, et le logo
  res\\                         l'icône et le nom de l'application
  snedai.keystore              la clé qui signe l'application (à garder : sans elle, une nouvelle version
                               ne peut pas remplacer l'ancienne)

Ce que fait l'application : elle ouvre l'écran de scan (/mobile/ sur le port 8000 du serveur) en plein écran,
garde l'écran allumé et retrouve toute seule le serveur si le Wi-Fi change.
'''

def lire(c):
    with open(c, encoding="utf-8-sig") as f:
        return f.read()

def ecrire(c, texte):
    os.makedirs(os.path.dirname(c), exist_ok=True)
    with open(c, "w", encoding="utf-8", newline="") as f:
        f.write(texte)

def remplacer(texte, ancien, nouveau, nom):
    if ancien not in texte:
        sys.exit(f"ARRET : {nom} n'a pas le contenu attendu (introuvable : {ancien[:60]!r}). Rien n'a ete modifie.")
    return texte.replace(ancien, nouveau, 1)

# ---------------------------------------------------------------- 1. vérifications
if os.path.isdir(chemin("backend")):
    sys.exit("Deja range : le dossier backend existe. Rien a faire.")
for obligatoire in ("manage.py", "config", "evenements", "web", "mobile"):
    if not os.path.exists(chemin(obligatoire)):
        sys.exit(f"ARRET : {obligatoire} introuvable. Lance ce script depuis le dossier du projet (celui qui contient manage.py).")

# ---------------------------------------------------------------- 2. nouveaux contenus (préparés en mémoire)
reglages = lire(chemin("config", "settings.py")).replace("\r\n", "\n")
lignes = [l for l in reglages.split("\n") if "CorsMiddleware" not in l and not l.startswith("CORS_")]
reglages = "\n".join(lignes).rstrip("\n") + '''

# --- Les trois dossiers du projet : le même serveur sert aussi l'application web et l'application mobile ---
DOSSIER_WEB = BASE_DIR.parent / "web"
DOSSIER_MOBILE = BASE_DIR.parent / "mobile" / "app"
'''

app_web = lire(chemin("web", "app.js")).replace("\r\n", "\n")
app_web = remplacer(app_web, "const API = `${location.protocol}//${location.hostname}:8000`;",
                    'const API = "";        /* le site et l\'API sont sur le même serveur : les appels commencent par /api/ */', "web/app.js")
app_web = remplacer(app_web, 'suivant = page.next ? page.next.replace(API, "") : null;',
                    'suivant = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;', "web/app.js")
app_web = app_web.replace("  L'adresse de l'API est celle de cet ordinateur sur le port 8000 : rien à configurer.",
                          "  Le site et l'API sont servis par le même serveur : les appels commencent par /api/, rien à configurer.")

app_mobile = lire(chemin("mobile", "app.js")).replace("\r\n", "\n")
app_mobile = remplacer(app_mobile, "const API = `${location.protocol}//${location.hostname}:8000`;",
                       'const API = "";        /* le site et l\'API sont sur le même serveur : les appels commencent par /api/ */', "mobile/app.js")

android = {}
if os.path.isdir(chemin("zebra")):
    fichier = chemin("zebra", "src", "ci", "snedai", "scan", "MainActivity.java")
    if os.path.exists(fichier):
        t = lire(fichier).replace("\r\n", "\n")
        t = remplacer(t, 'static final String PORT_PAR_DEFAUT = "3001";', 'static final String PORT_PAR_DEFAUT = "8000";', "MainActivity.java")
        t = remplacer(t, '+ ":" + PORT_PAR_DEFAUT) + "/";', '+ ":" + PORT_PAR_DEFAUT) + "/mobile/";', "MainActivity.java")
        t = t.replace("(servie sur le port 3001 du serveur)", "(servie sur /mobile/ du serveur)")
        android["src/ci/snedai/scan/MainActivity.java"] = t
    fichier = chemin("zebra", "AndroidManifest.xml")
    if os.path.exists(fichier):
        t = lire(fichier).replace("\r\n", "\n")
        t = remplacer(t, 'android:versionCode="3"', 'android:versionCode="4"', "AndroidManifest.xml")
        t = remplacer(t, 'android:versionName="1.2"', 'android:versionName="1.3"', "AndroidManifest.xml")
        android["AndroidManifest.xml"] = t
    fichier = chemin("zebra", "construire.sh")
    if os.path.exists(fichier):
        t = lire(fichier).replace("\r\n", "\n")
        t = remplacer(t, "--version-code 3 --version-name 1.2", "--version-code 4 --version-name 1.3", "construire.sh")
        t = t.replace('echo "APK : $(pwd)/snedai-scan.apk"', 'cp snedai-scan.apk ../app/snedai-scan.apk\necho "APK : $(pwd)/snedai-scan.apk (copie dans mobile/app)"')
        android["construire.sh"] = t

# ---------------------------------------------------------------- 3. déplacements
try:
    os.makedirs(chemin("backend"))
    for nom in ("manage.py", "config", "evenements", "templates", "static", "db.sqlite3"):
        if os.path.exists(chemin(nom)):
            shutil.move(chemin(nom), chemin("backend", nom))
    os.makedirs(chemin("mobile", "app"), exist_ok=True)
    for nom in os.listdir(chemin("mobile")):
        if nom not in ("app", "android"):
            shutil.move(chemin("mobile", nom), chemin("mobile", "app", nom))
    if os.path.isdir(chemin("zebra")):
        shutil.move(chemin("zebra"), chemin("mobile", "android"))
except PermissionError as erreur:
    sys.exit(f"ARRET : un fichier est utilise ({erreur}). Arrete d'abord les serveurs (arreter.ps1) et ferme les terminaux qui les font tourner, puis relance ce script.")

# ---------------------------------------------------------------- 4. écriture des fichiers modifiés
ecrire(chemin("backend", "config", "settings.py"), reglages)
ecrire(chemin("backend", "config", "urls.py"), NOUVEAU_URLS)
ecrire(chemin("web", "app.js"), app_web)
ecrire(chemin("mobile", "app", "app.js"), app_mobile)
for relatif, texte in android.items():
    ecrire(chemin("mobile", "android", *relatif.split("/")), texte)
ecrire(chemin("mobile", "android", "LISEZMOI.txt"), LISEZMOI)
ecrire(chemin("README.md"), README)
ecrire(chemin("docs", "architecture.md"), ARCHI)

# ---------------------------------------------------------------- 5. nettoyage de ce qui ne sert plus
for fichier in (("backend", "evenements", "cors.py"), ("lancer.ps1",), ("arreter.ps1",), ("serveurs.pid",), ("outils", "mettre_a_jour_settings.py")):
    if os.path.exists(chemin(*fichier)):
        os.remove(chemin(*fichier))
for dossier in ("logs", "outils"):
    if os.path.isdir(chemin(dossier)):
        if dossier == "outils" and os.listdir(chemin(dossier)):
            continue
        shutil.rmtree(chemin(dossier), ignore_errors=True)
ancien_apk = chemin("mobile", "app", "snedai-scan.apk")
if os.path.exists(ancien_apk):
    os.remove(ancien_apk)          # l'ancienne version se connecte au port 3001 : remplace-la par la version 1.3

print("OK : projet range (backend, web, mobile, docs). Les serveurs 3000 et 3001 n'existent plus : tout passe par le port 8000.")
sys.stdout.flush()
resultat = subprocess.run([sys.executable, "manage.py", "check"], cwd=chemin("backend"))
sys.exit(resultat.returncode)
