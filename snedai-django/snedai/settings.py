"""Réglages du site des événements SNEDAI. Tout se règle par variables d'environnement (voir le README)."""
import os
import secrets
from pathlib import Path
from urllib.parse import urlparse

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=''):
    return os.environ.get(name, default)


def env_list(name, separator=','):
    return [item.strip() for item in env(name).split(separator) if item.strip()]


def clean_secret(value):
    # Espaces ou guillemets collés par erreur autour d'une clé : retirés.
    return value.strip().strip('"\'')


DEBUG = env('DJANGO_DEBUG') == '1'
# Render définit RENDER=true : le mode production s'active sans réglage.
PRODUCTION = not DEBUG and (env('RENDER') == 'true' or env('DJANGO_PRODUCTION') == '1')

SECRET_KEY = env('SECRET_KEY') or env('SESSION_SECRET')
if not SECRET_KEY:
    if PRODUCTION:
        raise RuntimeError('SECRET_KEY (ou SESSION_SECRET) doit être défini.')
    SECRET_KEY = 'dev-' + secrets.token_hex(24)

PORT = int(env('PORT') or 8000)
# Sur Render, RENDER_EXTERNAL_URL donne l'adresse publique du site sans réglage supplémentaire.
APP_URL = (env('APP_URL') or env('RENDER_EXTERNAL_URL') or f'http://localhost:{PORT}').rstrip('/')
_host = urlparse(APP_URL).hostname or 'localhost'
ALLOWED_HOSTS = sorted({_host, 'localhost', '127.0.0.1', 'testserver', *env_list('ALLOWED_HOSTS')})
CSRF_TRUSTED_ORIGINS = [APP_URL]

ADMIN_EMAILS = [email.lower() for email in env_list('ADMIN_EMAILS')]
FILIALES = env_list('FILIALES', ';')
TIME_ZONE = env('TIMEZONE') or 'Africa/Abidjan'
USE_TZ = True
LANGUAGE_CODE = 'fr-fr'
USE_I18N = True

GOOGLE_CLIENT_ID = env('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET')
GOOGLE_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

# E-mails : AgentMail (prioritaire), puis Brevo, puis SMTP.
AGENTMAIL_API_KEY = clean_secret(env('AGENTMAIL_API_KEY'))
AGENTMAIL_INBOX = clean_secret(env('AGENTMAIL_INBOX')).lower()
BREVO_API_KEY = clean_secret(env('BREVO_API_KEY'))
SMTP_HOST = env('SMTP_HOST')
SMTP_PORT = int(env('SMTP_PORT') or 587)
SMTP_SECURE = env('SMTP_SECURE') == 'true'
SMTP_USER = env('SMTP_USER')
SMTP_PASSWORD = env('SMTP_PASSWORD')
MAIL_FROM = env('MAIL_FROM') or SMTP_USER or (ADMIN_EMAILS[0] if ADMIN_EMAILS else '')

# Application Android (TWA) : publiés dans /.well-known/assetlinks.json.
ANDROID_PACKAGE_NAME = env('ANDROID_PACKAGE_NAME').strip()
ANDROID_CERT_SHA256 = [value.upper() for value in env_list('ANDROID_CERT_SHA256')]

# Tentatives de connexion / d'inscription autorisées par adresse IP et par période de 15 minutes.
LOGIN_RATE_LIMIT = int(env('LOGIN_RATE_LIMIT') or 20)

# Ajouté aux adresses du CSS et du JavaScript : à chaque mise en ligne, le navigateur charge la nouvelle version.
ASSET_VERSION = (env('RENDER_GIT_COMMIT') or secrets.token_hex(6))[:12]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'evenements',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'evenements.security.ApiMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'evenements.security.HeadersMiddleware',
]

ROOT_URLCONF = 'snedai.urls'
WSGI_APPLICATION = 'snedai.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'evenements.context_processors.site',
            ],
        },
    },
]

# Sans DATABASE_URL (essais en local), une base SQLite est créée à côté du projet.
_database_url = env('DATABASE_URL') or f'sqlite:///{BASE_DIR / "db.sqlite3"}'
DATABASES = {'default': dj_database_url.parse(_database_url, conn_max_age=60)}
if DATABASES['default']['ENGINE'].endswith('postgresql'):
    DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True  # Neon passe par un « pooler »

AUTH_USER_MODEL = 'evenements.User'
AUTHENTICATION_BACKENDS = ['django.contrib.auth.backends.ModelBackend']
LOGIN_URL = '/connexion'
CSRF_FAILURE_VIEW = 'evenements.security.handler403_csrf'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}
WHITENOISE_MAX_AGE = 86400
WHITENOISE_USE_FINDERS = True

SESSION_COOKIE_NAME = 'snedai.sid'
SESSION_COOKIE_AGE = 7 * 24 * 60 * 60
SESSION_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_NAME = 'snedai.csrf'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
if PRODUCTION:
    SECURE_HSTS_SECONDS = 15552000
X_FRAME_OPTIONS = 'SAMEORIGIN'
DATA_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024  # photo de 3 Mo + champs du formulaire
FILE_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
