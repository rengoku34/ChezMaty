# Application mobile (Flutter)

L'application des agents de scan, installée sur le Zebra. Elle retrouve toute seule le serveur sur le Wi-Fi,
l'agent se connecte une fois, puis chaque QR code lu est envoyé à l'API (`/api/scan/`).

## Les fichiers (dossier `lib/`)

| Fichier | Rôle |
|---|---|
| `main.dart` | Le démarrage et l'enchaînement des écrans (logo, serveur injoignable, connexion, scan). |
| `ecrans.dart` | Les écrans : vert (présence validée), orange (déjà scanné), rouge (inconnu). |
| `api.dart` | Le dialogue avec le backend : connexion par jeton, scan, qui suis-je. |
| `decouverte.dart` | La recherche automatique du serveur sur le réseau (`/api/ping/`). |
| `son.dart` | Le bip (deux notes montantes si validé, deux sons graves sinon) et la vibration. |
| `depot.dart` | Ce que l'application retient : adresse du serveur et jeton. |

## Vérifier et fabriquer l'application

```
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

Le fichier d'installation est créé dans `build/app/outputs/flutter-apk/app-release.apk`.
Copie-le dans le dossier `livrables` du projet sous le nom `snedai-scan.apk` : le serveur le met alors à disposition à
l'adresse `http://ADRESSE-DU-SERVEUR:8000/snedai-scan.apk`, à ouvrir depuis le navigateur du Zebra pour l'installer.
