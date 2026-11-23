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
backend/    manage.py, config/ (réglages, adresses), evenements/ (models, views, serializers, services, ...), templates/, static/
web/        index.html, style.css, app.js, logo.png
mobile/     l'application Flutter
```

## Démarrer le site (un seul serveur)

Dans le dossier `backend` :

```
python manage.py runserver 0.0.0.0:8000
```

Pour arrêter : `Ctrl+C` dans ce terminal. Tout s'arrête.

| Adresse | Ce que c'est |
|---|---|
| `http://localhost:8000/` | L'application web de l'administrateur |
| `http://localhost:8000/api/` | L'API |
| `http://localhost:8000/docs/` | La documentation de l'API |
| `http://localhost:8000/admin/` | Le backoffice Django (comptes et inscriptions) |
| `http://localhost:8000/snedai-scan.apk` | L'installation de l'application mobile sur le Zebra |

## Les lieux, les places et le jeton

- Les **lieux** sont une liste de sites (une liste de départ est fournie). Dans le formulaire d'un événement, on choisit un site ou on en écrit un nouveau : il est enregistré dans la liste.
- Le **message de l'e-mail** se fabrique avec le nom et le thème de l'événement, la date, le lieu, les horaires et le lien. Le contact et la phrase de fin s'écrivent dans « Personnaliser le message » ; un nouvel événement reprend ceux du précédent.
- Le **numéro de téléphone** d'un employé compte exactement 10 chiffres.
- Le **jeton** de connexion expire après `JETON_DUREE_HEURES` heures (12 par défaut, dans `backend/config/settings.py`). Passé ce délai, il faut se reconnecter. Changer le mot de passe d'un compte déconnecte aussi ses appareils.

## L'application mobile

Voir `mobile/README.md` : `flutter test`, puis `flutter build apk --release`.

## Réglages (`backend/config/settings.py`)

- `APP_URL` : l'adresse du site dans les liens des e-mails (à mettre à jour si l'adresse IP change).
- `ADRESSES_DIFFUSION` : les destinataires du bouton « Envoyer le lien à tous les employés ».
- `CONTACT_EVENEMENTS` (facultatif) : la personne à contacter, affichée en bas des e-mails (ex. `"le Département Relation Sociale au 00 00 00 00"`).
- `SIGNATURE_EVENEMENTS` (facultatif) : la signature des e-mails (`"SNEDAI"` par défaut).
- `PHRASE_FIN_EVENEMENTS` (facultatif) : la phrase qui termine l'e-mail (ex. `"Ensemble, informons-nous et mobilisons-nous !"`).
- `NOM_EXPEDITEUR` (facultatif) : le nom affiché de l'expéditeur (`"SNEDAI Événements"` par défaut ; par exemple `"Direction Communication"`).
- `OBJET_INVITATION` (facultatif) : l'objet de l'invitation, avec `{nom}` pour le nom de l'événement (`"Invitation : {nom}"` par défaut).
- Les e-mails utilisent les variables Windows `EMAIL_USER` et `EMAIL_MOT_DE_PASSE` (jamais écrites dans le code).
