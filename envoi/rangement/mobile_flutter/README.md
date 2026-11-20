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
| `lecteur.dart` | Le lecteur du Zebra : l'application crée toute seule le profil DataWedge « SnedaiScan » et reçoit les codes lus par un message. |
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

## Le lecteur du Zebra

Au démarrage de l'écran de scan, l'application configure DataWedge (profil « SnedaiScan », réservé à elle) : le code lu est envoyé à l'application par un message (« intent »), et non plus tapé comme au clavier. Le code Android correspondant est dans `android/app/src/main/java/ci/snedai/snedai_scan/MainActivity.java`. Une ligne en haut de l'écran indique « Code reçu à HH:MM » quand le lecteur a bien remis un code.
