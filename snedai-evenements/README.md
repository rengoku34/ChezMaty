# Événements SNEDAI

Plateforme interne des événements SNEDAI, en **Node.js (Express) + SQLite**, sans PHP.

## Ce que fait le site

1. **Compte**. Le formulaire a deux onglets :
   - **Créer mon compte** : nom, prénom, filiale et mot de passe, puis validation par **Google**. L'adresse e-mail est celle du compte Google, donc elle est forcément réelle.
   - **Se connecter** : adresse e-mail et mot de passe, ou bouton Google.
2. **« La maison »**. Sans compte, on ne voit rien : toutes les pages renvoient vers le formulaire. Une fois connecté, on voit les événements en cours (sujet, description, photo, horaires, lieu).
3. **Annonce par e-mail**. Quand l'administrateur publie un événement, chaque inscrit reçoit un e-mail avec un lien pour répondre.
4. **« Je serai présent(e) »**. Ce bouton génère un **QR code personnel**, affiché sur la page et envoyé par e-mail. La personne peut aussi annuler.
5. **Scan à l'entrée**. Un agent d'accueil scanne le QR code sur la page `/scan` :
   - avec une **douchette** (lecteur de QR code USB ou Bluetooth qui « tape » le code) ;
   - ou avec la **caméra** d'un téléphone ou d'une tablette.

   La présence est alors confirmée. Un QR code déjà scanné ou un code inconnu est signalé.
6. **Tableau de bord** (administrateur seulement), un par événement, choisi dans une **liste déroulante** qui sert d'historique. Il présente :
   - les inscrits sur le site ;
   - ceux qui ont dit qu'ils seraient présents ;
   - ceux qui étaient vraiment là (QR code scanné).

   Pour chaque liste : nom, prénom, e-mail, filiale, plus un bouton **Exporter en Excel** (un fichier .xlsx avec un onglet par liste).
7. **Terminer**. Seul l'administrateur marque un événement comme terminé. « Terminé » s'affiche alors en bas du tableau de bord, les QR codes ne sont plus acceptés et l'événement passe dans « Événements passés ».

### Qui a le droit de faire quoi

| Rôle | Comment | Droits |
|---|---|---|
| Administrateur (vous) | Adresse(s) listée(s) dans `ADMIN_EMAILS` | Publier, tableau de bord, listes, Excel, terminer, nommer les agents |
| Agent d'accueil | Nommé par l'administrateur (menu « Agents ») | Uniquement la page de scan |
| Employé | Toute personne inscrite | Voir les événements, confirmer sa présence, son QR code |

Les droits d'administration sont lus dans la configuration du serveur, pas dans la base de données. Personne ne peut donc se les donner depuis le site.

## Installation en local

Prérequis : [Node.js](https://nodejs.org) version 20.12 ou plus récente.

```bash
cd snedai-evenements
npm install
cp .env.example .env      # puis remplir le fichier .env
npm start                 # http://localhost:3000
```

Pour lancer les tests automatiques : `npm test`.

### 1. Créer le client Google (obligatoire pour l'inscription)

1. Allez sur <https://console.cloud.google.com/>, créez un projet, puis ouvrez **API et services → Écran de consentement OAuth**. Choisissez le type « Externe », remplissez le nom de l'application et votre e-mail.
2. Ouvrez **Identifiants → Créer des identifiants → ID client OAuth**, de type **Application Web**.
3. Dans **URI de redirection autorisés**, ajoutez `http://localhost:3000/auth/google/callback`, puis plus tard l'adresse publique, par exemple `https://votre-site.onrender.com/auth/google/callback`.
4. Copiez l'ID client et le code secret dans `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` du fichier `.env`.

### 2. Configurer l'envoi des e-mails (Gmail)

1. Activez la validation en deux étapes sur le compte Gmail qui enverra les messages.
2. Créez un **mot de passe d'application** : <https://myaccount.google.com/apppasswords>.
3. Dans `.env`, renseignez :
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=` votre adresse Gmail
   - `SMTP_PASSWORD=` le mot de passe d'application
   - `MAIL_FROM=` votre adresse Gmail

Gmail limite l'envoi à environ 500 e-mails par jour. Au-delà, utilisez le SMTP de l'entreprise ou un service comme Brevo. Sans SMTP, le site fonctionne mais les e-mails sont seulement notés dans le journal du serveur.

### 3. Vous déclarer administrateur

Mettez votre adresse dans `ADMIN_EMAILS`, puis créez votre compte sur le site avec cette même adresse Google. Le menu « Publier / Tableau de bord / Agents » apparaît alors.

## Mise en ligne

N'importe quel hébergeur Node.js convient : Render, Railway, un VPS, ou un serveur interne SNEDAI. Points importants :

- **Données persistantes** : la base (`DATABASE_PATH`) et les photos (`UPLOAD_DIR`) doivent être sur un disque qui n'est pas effacé à chaque redéploiement, par exemple un « Persistent Disk » sur Render.
- Définissez `NODE_ENV=production`, `APP_URL` (adresse publique en https) et un `SESSION_SECRET` long et aléatoire.
- **HTTPS obligatoire** pour que la caméra fonctionne sur la page de scan. Les douchettes, elles, fonctionnent partout.

## Organisation du code

```
src/
  server.js          démarrage (lecture du .env)
  app.js             assemblage d'Express, sécurité (Helmet, CSRF, sessions)
  config.js          lecture des variables d'environnement
  db.js              schéma SQLite et requêtes
  auth.js            Google OAuth, rôles (admin / agent / employé)
  mailer.js          e-mails d'annonce et d'envoi du QR code
  qr.js              génération et lecture des QR codes
  excel.js           export .xlsx du tableau de bord
  routes/            pages : auth, événements, admin, scan
views/               pages HTML (EJS)
public/              CSS et JavaScript du navigateur
test/                tests automatiques (npm test)
```
