# Événements SNEDAI — application mobile (Expo / React Native)

Employés : événements, confirmation de présence, billet QR. Agents : scan des billets (caméra ou lecteur du terminal).
La publication et les tableaux de bord restent sur le site web.

## Essayer sur un téléphone (sans compte développeur)
1. Installer **Expo Go** (App Store / Play Store) sur le téléphone.
2. Sur l'ordinateur : `cd snedai-mobile && npm install && npx expo start`
3. Scanner le QR code affiché (iPhone : appareil photo ; Android : Expo Go).

Serveur utilisé : `extra.apiUrl` dans `app.json` (ou la variable `EXPO_PUBLIC_API_URL`).

## APK Android (terminal de scan)
`npx eas-cli build -p android --profile preview`

## Vérifications
`npm run typecheck`
