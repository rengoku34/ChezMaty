# Backend

Django + API REST. Démarrage (depuis ce dossier) : `python manage.py runserver 0.0.0.0:8000`. `Ctrl+C` arrête tout.

| Dossier | Contenu |
|---|---|
| `config/` | `settings.py` (réglages) et `urls.py` (aiguillage vers l'API, les pages, le web et l'APK). |
| `evenements/models.py` | Les données : `Lieu`, `Evenement`, `Inscription`. |
| `evenements/validators.py` | Les règles de saisie (créneaux, téléphone de 10 chiffres). |
| `evenements/api/` | L'API : `views/` (compte, événements, lieux, inscription, scan), `serializers.py`, `permissions.py`, `authentification.py`, `urls.py`. |
| `evenements/pages/` | Les pages HTML : lien d'inscription, formulaire, remerciement, billet, connexion, scan. |
| `evenements/services/` | Le travail : e-mails, QR codes, conflits de lieu, scan, export Excel. |
| `templates/`, `static/` | Les pages et fichiers (CSS, JS) des employés. |

La documentation de l'API est sur `http://localhost:8000/docs/`.
