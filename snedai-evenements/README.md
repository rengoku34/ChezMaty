# Événements SNEDAI

Plateforme interne des événements SNEDAI, en **Node.js (Express) + PostgreSQL**, sans PHP. Elle s'héberge gratuitement.

## Ce que fait le site

1. **Compte**. Le formulaire a deux onglets :
   - **Créer mon compte** : nom, prénom, filiale et mot de passe, puis validation par **Google**. L'adresse e-mail est celle du compte Google, donc elle est forcément réelle.
   - **Se connecter** : adresse e-mail et mot de passe, ou bouton Google.
2. **« La maison »**. Sans compte, on ne voit rien : toutes les pages renvoient vers le formulaire. Une fois connecté, on voit les événements en cours (sujet, description, photo, horaires, lieu).
3. **Annonce par e-mail**. Quand l'administrateur publie un événement, chaque inscrit reçoit un e-mail avec un lien pour répondre.
4. **« Je serai présent(e) »**. Ce bouton génère un **QR code personnel**, affiché sur la page et envoyé par e-mail en pièce jointe. La personne peut aussi annuler.
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

## Mise en ligne 100 % gratuite (faisable depuis un téléphone)

Quatre services gratuits, sans carte bancaire :

| Service | Rôle | Offre gratuite |
|---|---|---|
| **Render** | Fait tourner le site | Gratuit ; le site « s'endort » après 15 min sans visite et met environ 1 minute à se réveiller |
| **Neon** | Base de données (comptes, événements, photos) | Gratuit, les données sont conservées |
| **Brevo** | Envoi des e-mails | Gratuit jusqu'à 300 e-mails par jour |
| **Google Cloud** | Bouton « Créer mon compte avec Google » | Gratuit |

L'offre gratuite de Render bloque l'envoi d'e-mails par SMTP (Gmail), c'est pourquoi le site passe par l'API de Brevo.

Conseil : sur téléphone, ouvrez ces sites dans Chrome avec l'option **« Version pour ordinateur »**.

### Étape 1 : la base de données (Neon)

1. Allez sur <https://neon.com>, appuyez sur **Sign up**, puis connectez-vous avec Google ou GitHub.
2. Créez un projet nommé `snedai`. Choisissez la région la plus proche, par exemple **Europe (Frankfurt)**.
3. Appuyez sur **Connect** et copiez la **connection string**, qui commence par `postgresql://…`. C'est votre `DATABASE_URL`.

### Étape 2 : les e-mails (Brevo)

1. Créez un compte sur <https://www.brevo.com>. Choisissez le plan **Free**.
2. Dans **Expéditeurs, domaines et IP dédiées → Expéditeurs**, ajoutez votre adresse e-mail et validez-la avec le lien reçu.
3. Dans **SMTP & API → Clés API**, créez une clé et copiez-la. C'est votre `BREVO_API_KEY`.

Avec une adresse Gmail comme expéditeur, les premiers e-mails peuvent arriver dans les « Spams ». Demandez aux collègues de les marquer « Non spam ». Avec une adresse de l'entreprise (@snedai…), la livraison est meilleure.

### Étape 3 : l'hébergement (Render)

1. Allez sur <https://render.com> et connectez-vous avec **GitHub**.
2. Appuyez sur **New → Web Service**, puis choisissez le dépôt **ChezMaty**.
3. Remplissez les réglages :
   - **Branch** : `main`, une fois la pull request fusionnée
   - **Root Directory** : `snedai-evenements`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
4. Dans **Environment Variables**, ajoutez :
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = une longue phrase au hasard, par exemple 40 lettres et chiffres mélangés
   - `ADMIN_EMAILS` = votre adresse Gmail
   - `FILIALES` = `SNEDAI Groupe;SNEDAI Technologies;OSIA;Autre`, à adapter
   - `DATABASE_URL` = l'adresse copiée chez Neon
   - `BREVO_API_KEY` = la clé Brevo
   - `MAIL_FROM` = `Événements SNEDAI <votre.adresse@gmail.com>`
5. Appuyez sur **Deploy**. Render affiche l'adresse du site, du type `https://snedai-evenements.onrender.com`.
6. Ajoutez ensuite la variable `APP_URL` avec cette adresse, sans `/` à la fin.

### Étape 4 : le bouton Google

1. Allez sur <https://console.cloud.google.com/>. Créez un projet, puis ouvrez **API et services → Écran de consentement OAuth** :
   - choisissez le type **Externe** ;
   - indiquez le nom de l'application et votre e-mail ;
   - **publiez l'application** (« Publier l'application »), sinon seuls les comptes de test pourront s'inscrire.
2. Ouvrez **Identifiants → Créer des identifiants → ID client OAuth**, de type **Application Web**.
3. Dans **URI de redirection autorisés**, ajoutez `https://<votre-adresse-render>/auth/google/callback`.
4. Copiez l'ID client et le code secret dans les variables Render `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Render redémarre le site tout seul.

### Étape 5 : vous déclarer administrateur

Ouvrez le site et créez votre compte avec la même adresse Google que celle mise dans `ADMIN_EMAILS`. Les menus « Publier », « Tableau de bord » et « Agents » apparaissent alors.

Le site doit être en **HTTPS** pour que la caméra fonctionne sur la page de scan. C'est automatique avec Render. Les douchettes fonctionnent partout.

## Installation sur un ordinateur (pour développer)

Prérequis : [Node.js](https://nodejs.org) 20.12 ou plus récent, et une base PostgreSQL (celle de Neon convient).

```bash
cd snedai-evenements
npm install
cp .env.example .env      # puis remplir le fichier .env
npm start                 # http://localhost:3000
```

Pour lancer les tests (`npm test`), il faut une base PostgreSQL **de test**, indiquée dans `TEST_DATABASE_URL`. Elle est vidée à chaque lancement : n'y mettez jamais la base réelle.

## Organisation du code

```
src/
  server.js          démarrage (lecture du .env)
  app.js             assemblage d'Express, sécurité (Helmet, CSRF, sessions en base)
  config.js          lecture des variables d'environnement
  db.js              schéma PostgreSQL et requêtes (photos comprises)
  auth.js            Google OAuth, rôles (admin / agent / employé)
  mailer.js          e-mails (API Brevo ou SMTP) : annonces et QR codes
  qr.js              génération et lecture des QR codes
  excel.js           export .xlsx du tableau de bord
  routes/            pages : auth, événements, admin, scan
views/               pages HTML (EJS)
public/              CSS et JavaScript du navigateur
test/                tests automatiques (npm test)
```
