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

## L'application mobile

Voir `mobile/README.md` : `flutter test`, puis `flutter build apk --release`.

## Réglages (`backend/config/settings.py`)

- `APP_URL` : l'adresse du site dans les liens des e-mails (à mettre à jour si l'adresse IP change).
- `ADRESSES_DIFFUSION` : les destinataires du bouton « Envoyer le lien à tous les employés ».
- Les e-mails utilisent les variables Windows `EMAIL_USER` et `EMAIL_MOT_DE_PASSE` (jamais écrites dans le code).
