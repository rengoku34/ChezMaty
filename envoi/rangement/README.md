# Plateforme des événements SNEDAI

Un administrateur crée un événement et envoie le lien d'inscription aux employés. Les employés s'inscrivent et reçoivent
un QR code par e-mail. Les agents scannent ce QR code à l'entrée (Zebra) : la présence est enregistrée.

## Les dossiers

| Dossier | Rôle |
|---|---|
| `backend/` | Le cœur : Django + API (données, règles, e-mails, QR codes, scan, Excel). |
| `web/` | L'application de l'administrateur (HTML, CSS, JavaScript). |
| `mobile/` | L'application des agents de scan (Flutter), installée sur le Zebra. |
| `livrables/` | Le fichier d'installation de l'application mobile (`snedai-scan.apk`). |
| `docs/` | La documentation. |

## Où trouver quoi

```
backend/                       Django + API
  manage.py, requirements.txt, db.sqlite3
  config/                      réglages (settings.py) et liste des adresses (urls.py)
  evenements/
    models.py, validators.py   les données et leurs règles
    api/                       tout ce qui répond à /api/ : views/ (compte, événements, lieux, inscription, scan),
                               serializers.py, permissions.py, authentification.py, urls.py
    pages/                     les pages HTML : lien, formulaire, merci, billet, connexion, scan
    services/                  le travail : e-mails, QR codes, conflits de lieu, scan, Excel
    migrations/
  templates/, static/          les pages des employés (HTML, CSS, JavaScript)
web/                           l'application de l'administrateur
  index.html
  css/style.css
  js/                          main.js (pages), api.js, outils.js, coque.js, vues/ (une page par fichier)
  img/                         logo et icône
mobile/                        l'application Flutter des agents de scan
```

## Démarrer le site (un seul serveur)

Dans le dossier `backend` :

```
python manage.py runserver 0.0.0.0:8000
```

Pour arrêter : `Ctrl+C` dans ce terminal. Tout s'arrête (aucun serveur caché : le site n'est plus joignable ensuite).

| Adresse | Ce que c'est |
|---|---|
| `http://localhost:8000/` | L'application web de l'administrateur |
| `http://localhost:8000/api/` | L'API |
| `http://localhost:8000/docs/` | La documentation de l'API |
| `http://localhost:8000/admin/` | Le backoffice Django (comptes et inscriptions) |
| `http://localhost:8000/snedai-scan.apk` | L'installation de l'application mobile sur le Zebra |

## Les lieux, les places et le jeton

- Les **lieux** des événements se gèrent dans la page « Lieux » de l'application web (ajouter, renommer, supprimer). Un lieu utilisé par un événement ne peut pas être supprimé.
- Dans le formulaire d'un événement, le **lieu** se choisit dans la liste (on peut aussi taper quelques lettres pour le retrouver). La **date** et les **horaires** se choisissent avec des sélecteurs.
- Le **numéro de téléphone** d'un employé compte exactement 10 chiffres.
- Chaque événement peut avoir une **date limite d'inscription** et un **nombre de places** (facultatifs) : passé la date, ou quand toutes les places sont prises, le lien n'accepte plus d'inscription.
- Le **jeton** de connexion expire après `JETON_DUREE_HEURES` heures (12 par défaut, dans `backend/config/settings.py`). Passé ce délai, il faut se reconnecter. Changer le mot de passe d'un compte déconnecte aussi ses appareils.

## L'application mobile

Voir `mobile/README.md` : `flutter test`, puis `flutter build apk --release`.

## Réglages (`backend/config/settings.py`)

- `APP_URL` : l'adresse du site dans les liens des e-mails (à mettre à jour si l'adresse IP change).
- `ADRESSES_DIFFUSION` : les destinataires du bouton « Envoyer le lien à tous les employés ».
- `CONTACT_EVENEMENTS` (facultatif) : la personne à contacter, affichée en bas des e-mails (ex. `"le Département Relation Sociale au 00 00 00 00"`).
- `SIGNATURE_EVENEMENTS` (facultatif) : la signature des e-mails (`"SNEDAI"` par défaut).
- `NOM_EXPEDITEUR` (facultatif) : le nom affiché de l'expéditeur (`"SNEDAI Événements"` par défaut ; par exemple `"Direction Communication"`).
- `OBJET_INVITATION` (facultatif) : l'objet de l'invitation, avec `{nom}` pour le nom de l'événement (`"Invitation : {nom}"` par défaut).
- Les e-mails utilisent les variables Windows `EMAIL_USER` et `EMAIL_MOT_DE_PASSE` (jamais écrites dans le code).
