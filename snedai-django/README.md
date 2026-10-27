# Événements SNEDAI — version Django

Plateforme web des événements internes de SNEDAI, écrite avec **Django** (Python).
Elle fait exactement la même chose que la version Express du dossier `snedai-evenements`, avec le même design,
et elle sert la même application mobile (`snedai-mobile`) par les mêmes adresses `/api/v1`.

- Inscription et connexion (nom, prénom, filiale, e-mail, mot de passe ; confirmation de l'adresse par un code reçu par e-mail ou par Google).
- L'employé ne voit les événements qu'après connexion ; il confirme sa présence et reçoit un billet avec un QR code personnel (aussi par e-mail).
- L'administrateur (adresses de `ADMIN_EMAILS`) publie, modifie et termine les événements, voit le tableau de bord (inscrits, ont dit oui, étaient là), exporte en Excel et en PDF, désigne les agents de scan.
- L'agent scanne les QR codes (terminal à gâchette, ou caméra) : la présence est enregistrée.
- E-mails automatiques : code de confirmation, bienvenue, nouvel événement, QR code.

## Essayer chez soi

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows   (Mac/Linux : source .venv/bin/activate)
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo      # comptes et événements de démonstration (local uniquement)
set ADMIN_EMAILS=admin@test.ci  # Mac/Linux : export ADMIN_EMAILS=admin@test.ci
set DJANGO_DEBUG=1              # Mac/Linux : export DJANGO_DEBUG=1
python manage.py runserver
```

Puis ouvrir http://localhost:8000 — comptes de démonstration : `admin@test.ci` (administrateur), `moussa@test.ci` (agent),
`awa@test.ci` et `issa@test.ci` (employés), mot de passe `motdepasse1`.
Sans `DATABASE_URL`, une base SQLite est créée automatiquement.

## Tests

```bash
python manage.py test      # 56 tests : accès, parcours complet, e-mails, Google, API mobile, dates, QR…
```

## Mise en ligne gratuite (Render + Neon)

Dans Render, sur le service existant (ou un nouveau « Web Service ») :

| Réglage | Valeur |
|---|---|
| Root Directory | `snedai-django` |
| Build Command | `pip install -r requirements.txt && python manage.py collectstatic --noinput` |
| Start Command | `python manage.py migrate && gunicorn snedai.wsgi --bind 0.0.0.0:$PORT --workers 2 --timeout 60` |
| Variables | les mêmes que la version Express (voir ci-dessous) |

Variables d'environnement : `DATABASE_URL` (Neon), `SESSION_SECRET` (ou `SECRET_KEY`), `ADMIN_EMAILS`, `FILIALES` (séparées par `;`),
`AGENTMAIL_API_KEY` + `AGENTMAIL_INBOX` (ou `BREVO_API_KEY`, ou `SMTP_*`), `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (facultatif),
`APP_URL` (déduit de Render si absent), `TIMEZONE` (défaut `Africa/Abidjan`), `PYTHON_VERSION` = `3.13`.
Django crée ses propres tables (`evenements_*`) : on peut garder la même base Neon, les anciennes tables ne gênent pas.
Les comptes de l'ancienne version ne sont pas repris : il faut les recréer.

## Où est quoi (pour expliquer le projet)

| Fichier | Rôle |
|---|---|
| `snedai/settings.py` | Réglages (base de données, sécurité, variables d'environnement) |
| `snedai/urls.py` | Liste des adresses du site et de l'API, et la vue qui répond à chacune |
| `evenements/models.py` | Les tables : `User`, `Event`, `Participation` (billet), `ApiToken`, `PendingSignup` |
| `evenements/views/` | `auth.py` (comptes), `site.py` (employés), `admin_site.py` (administrateur), `api.py` (application mobile) |
| `evenements/services/` | Règles métier : e-mails, QR, Excel, PDF, agenda, scan, dates en français |
| `evenements/security.py` | En-têtes de sécurité, limitation des tentatives, contrôle des rôles |
| `templates/` | Les pages HTML (gabarits Django) |
| `static/` | CSS, JavaScript, images, logo |
| `evenements/tests/` | Les tests automatiques |

Ce que Django fournit déjà (et qu'il fallait écrire à la main avec Express) : l'ORM (tables décrites en Python, migrations),
le hachage des mots de passe, les sessions, la protection CSRF, l'interface d'administration (`/django-admin/`, réservée aux `ADMIN_EMAILS`).
