"""
Réglages du projet « Événements SNEDAI ».

Ce fichier est lu par Django au démarrage. On y décide : la langue, le fuseau horaire,
la base de données, la sécurité… Les valeurs qui changent d'un ordinateur à l'autre
(ou qui sont secrètes) viennent du fichier .env, pas du code.
"""
import os
import secrets
from pathlib import Path

# BASE_DIR = le dossier racine du projet (celui qui contient manage.py).
BASE_DIR = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# 1. Lire le fichier .env
# ---------------------------------------------------------------------------
def charger_fichier_env():
    """Lit le fichier .env ligne par ligne (NOM=valeur) et le met dans les variables d'environnement.

    Sur ton ordinateur : les réglages viennent du fichier .env.
    En ligne (Render) : il n'y a pas de .env, les réglages sont saisis dans le tableau de bord de Render.
    Dans les deux cas, le code lit la même chose : os.environ.
    """
    fichier = BASE_DIR / '.env'
    if not fichier.exists():
        return
    for ligne in fichier.read_text(encoding='utf-8').splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith('#') or '=' not in ligne:
            continue  # on saute les lignes vides et les commentaires
        nom, valeur = ligne.split('=', 1)
        os.environ.setdefault(nom.strip(), valeur.strip())  # setdefault : une vraie variable est prioritaire


charger_fichier_env()


def lire(nom, defaut=''):
    """Renvoie la valeur d'un réglage, ou la valeur par défaut s'il n'existe pas."""
    return os.environ.get(nom, defaut)


def lire_liste(nom, separateur=','):
    """Renvoie un réglage sous forme de liste : « a;b;c » devient ['a', 'b', 'c']."""
    return [element.strip() for element in lire(nom).split(separateur) if element.strip()]


# ---------------------------------------------------------------------------
# 2. Sécurité et mode de fonctionnement
# ---------------------------------------------------------------------------
# DEBUG = True : Django affiche des pages d'erreur détaillées. Pratique chez soi, DANGEREUX en ligne.
DEBUG = lire('DJANGO_DEBUG') == '1'

# La clé secrète sert à signer les cookies et les sessions. Elle ne doit JAMAIS être publique.
SECRET_KEY = lire('SECRET_KEY') or lire('SESSION_SECRET')
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError('SECRET_KEY doit être défini en production.')
    SECRET_KEY = 'dev-' + secrets.token_hex(24)  # clé temporaire, seulement pour les essais

# Adresses (noms de domaine) autorisées à afficher le site : protège contre certaines attaques.
ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver'] + lire_liste('ALLOWED_HOSTS')

# ---------------------------------------------------------------------------
# 3. Réglages propres à SNEDAI
# ---------------------------------------------------------------------------
# Les adresses e-mail des administrateurs : celui qui a une de ces adresses peut publier des événements.
# Le rôle ne vient JAMAIS de la base de données, donc personne ne peut se l'attribuer en s'inscrivant.
ADMIN_EMAILS = [adresse.lower() for adresse in lire_liste('ADMIN_EMAILS')]

# La liste des filiales proposées à l'inscription (séparées par des points-virgules).
FILIALES = lire_liste('FILIALES', ';')

# Adresse publique du site (utilisée dans les e-mails). En ligne, Render la fournit.
APP_URL = (lire('APP_URL') or lire('RENDER_EXTERNAL_URL') or 'http://localhost:8000').rstrip('/')

# Ajouté aux adresses du CSS et du JavaScript (?v=...) : à chaque redémarrage, le navigateur recharge
# la nouvelle version au lieu de garder l'ancienne en mémoire.
ASSET_VERSION = (lire('RENDER_GIT_COMMIT') or secrets.token_hex(6))[:12]

# Nombre de tentatives de connexion / d'inscription autorisées par adresse IP et par période de 15 minutes
# (freine les pirates qui essaient des milliers de mots de passe).
LOGIN_RATE_LIMIT = int(lire('LOGIN_RATE_LIMIT') or 20)

# ---------------------------------------------------------------------------
# E-mails : le service d'envoi
# ---------------------------------------------------------------------------
# Le site envoie des e-mails (code de confirmation, bienvenue, nouvel événement, QR code).
# On essaie dans l'ordre : AgentMail (gratuit), puis Brevo, puis un serveur SMTP.
# Les clés sont des SECRETS : elles vont dans le fichier .env (chez toi) ou dans Render, jamais dans le code.
def nettoyer_cle(valeur):
    """Retire les espaces ou guillemets collés par erreur autour d'une clé."""
    return valeur.strip().strip('"\'')


AGENTMAIL_API_KEY = nettoyer_cle(lire('AGENTMAIL_API_KEY'))
AGENTMAIL_INBOX = nettoyer_cle(lire('AGENTMAIL_INBOX')).lower()     # la boîte d'envoi, ex. snedai@agentmail.to
BREVO_API_KEY = nettoyer_cle(lire('BREVO_API_KEY'))
SMTP_HOST = lire('SMTP_HOST')
SMTP_PORT = int(lire('SMTP_PORT') or 587)
SMTP_SECURE = lire('SMTP_SECURE') == 'true'
SMTP_USER = lire('SMTP_USER')
SMTP_PASSWORD = lire('SMTP_PASSWORD')
# L'expéditeur « Nom <adresse> » ; par défaut, la première adresse administrateur.
MAIL_FROM = lire('MAIL_FROM') or SMTP_USER or (ADMIN_EMAILS[0] if ADMIN_EMAILS else '')

# ---------------------------------------------------------------------------
# 4. Applications installées et « middlewares »
# ---------------------------------------------------------------------------
# Une « application » Django est un bloc de fonctionnalités. Ici, celles fournies par Django.
INSTALLED_APPS = [
    'django.contrib.admin',          # l'interface d'administration (/django-admin/)
    'django.contrib.auth',           # comptes et mots de passe
    'django.contrib.contenttypes',   # nécessaire à auth et admin
    'django.contrib.sessions',       # garde l'utilisateur connecté entre deux pages
    'django.contrib.messages',       # petits messages « Événement publié » après une action
    'django.contrib.staticfiles',    # gère le CSS, le JavaScript et les images
    'evenements',                    # NOTRE application (comptes, événements, billets)
]

# Un « middleware » est une étape par laquelle passe CHAQUE demande, avant d'arriver à ta vue.
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',                 # quelques protections de base
    'django.contrib.sessions.middleware.SessionMiddleware',          # retrouve la session de l'utilisateur
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',                     # protège les formulaires contre le CSRF
    'django.contrib.auth.middleware.AuthenticationMiddleware',       # sait QUI est connecté (request.user)
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',        # empêche d'afficher le site dans un cadre piégé
]

ROOT_URLCONF = 'snedai.urls'              # le fichier qui liste les adresses du site
WSGI_APPLICATION = 'snedai.wsgi.application'

# ---------------------------------------------------------------------------
# 5. Gabarits (les pages HTML)
# ---------------------------------------------------------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],   # notre dossier de pages HTML
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'evenements.context_processors.site',   # NOS variables disponibles dans toutes les pages
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# 6. Base de données
# ---------------------------------------------------------------------------
# Pour l'instant : SQLite, une simple base dans un fichier (db.sqlite3). Parfait pour développer.
# En ligne, on passera à PostgreSQL (Neon) à l'étape 17.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Règles de qualité des mots de passe : on garde les nôtres (8 caractères, lettre + chiffre) plus tard.
AUTH_PASSWORD_VALIDATORS = []

# ---------------------------------------------------------------------------
# 7. Langue, fuseau horaire, fichiers statiques
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'fr-fr'                        # l'interface de Django (admin, erreurs) en français
TIME_ZONE = lire('TIMEZONE') or 'Africa/Abidjan'   # heure de la Côte d'Ivoire
USE_I18N = True
USE_TZ = True                                  # les dates en base sont stockées en UTC, affichées en heure locale

STATIC_URL = '/static/'                        # les fichiers CSS/JS/images seront servis sous /static/
STATICFILES_DIRS = [BASE_DIR / 'static']       # notre dossier « static » à la racine du projet

# On remplace le modèle d'utilisateur de Django par le nôtre (nom, prénom, filiale, e-mail).
# ATTENTION : à faire avant la toute première migration.
AUTH_USER_MODEL = 'evenements.User'

# Taille maximale d'un envoi de formulaire (une photo de 3 Mo + les champs du texte).
DATA_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'   # type des numéros automatiques (id) des tables
