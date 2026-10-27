# Événements SNEDAI

Plateforme interne des événements SNEDAI, en **Node.js (Express) + PostgreSQL**, sans PHP. Elle s'héberge gratuitement.

## Ce que fait le site

1. **Compte**. Le formulaire a deux onglets :
   - **Créer un compte** : nom, prénom, filiale, adresse e-mail et mot de passe du site. L'adresse est ensuite **confirmée par un code à 6 chiffres** envoyé par e-mail, sans compte Google. Ceux qui le préfèrent peuvent la faire confirmer par **Google**.
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

### En plus

- **Accueil** : le prochain événement est mis en avant, avec un **compte à rebours**.
- **« Ajouter à mon agenda »** sur chaque événement : Google Agenda, Outlook, ou fichier `.ics` pour iPhone et les autres agendas.
- **Application installable** : le site s'installe sur le téléphone ou l'ordinateur, avec l'icône SNEDAI.
- **Tableau de bord** :
  - **taux de réponse** et **taux de présence** ;
  - graphique de **participation par filiale** ;
  - mise à jour automatique pendant l'événement.
- **Rapport PDF** en un clic, prêt pour la direction. Il contient les chiffres clés, les taux, la répartition par filiale, la liste des présents et celle des personnes annoncées mais non venues.
- **Comptes** : nommer les agents de scan, supprimer des comptes, tester l'envoi d'e-mails.

### Qui a le droit de faire quoi

| Rôle | Comment | Droits |
|---|---|---|
| Administrateur (vous) | Adresse(s) listée(s) dans `ADMIN_EMAILS` | Publier, tableau de bord, listes, Excel, terminer, nommer les agents |
| Agent d'accueil | Nommé par l'administrateur (menu « Agents ») | Uniquement la page de scan |
| Employé | Toute personne inscrite | Voir les événements, confirmer sa présence, son QR code |

Les droits d'administration sont lus dans la configuration du serveur, pas dans la base de données. Personne ne peut donc se les donner depuis le site.

## Régler le terminal de scan Android (lecteur intégré)

Le terminal (Android 12, lecteur de QR code intégré et boutons de scan orange) s'utilise avec la page **Scanner** du site. Ces réglages sont à faire une seule fois.

1. **Réglage du lecteur.** Ouvrez l'application de réglage du lecteur. Selon la marque, elle s'appelle « Scanner », « Scan Settings », « ScanWedge », « Keyboard Emulator », ou se trouve dans **Paramètres → Scanner**. Réglez :
   - **Mode de sortie** : « Clavier », « Keyboard emulation », « Simuler la frappe » ou « Remplir la zone de saisie » ;
   - **Suffixe** : **Entrée** (« Enter », « CR » ou « Retour chariot »). Si ce réglage n'existe pas, ce n'est pas grave : le site valide aussi le code tout seul ;
   - **QR Code** : activé dans la liste des symbologies ;
   - **Son et vibration** : au choix, le site émet déjà son propre bip.
2. **Navigateur.** Dans Chrome, ouvrez le site, connectez-vous avec un compte **agent de scan**, puis ouvrez **Scanner**. Pour aller plus vite, ajoutez la page à l'écran d'accueil : ⋮ → « Installer l'application » ou « Ajouter à l'écran d'accueil ».
3. **Utilisation.** Laissez la page ouverte et appuyez sur un bouton orange face au QR code :
   - **bip aigu et écran vert** : présence confirmée, avec le nom et la filiale de la personne ;
   - **deux bips graves et écran orange ou rouge** : QR code déjà scanné, inconnu, ou événement terminé.

La page garde l'écran allumé et le curseur dans le champ. Le clavier de l'écran ne s'ouvre pas : c'est la case « Mode machine de scan », cochée automatiquement sur Android.

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

### Étape 2 : les e-mails (AgentMail, recommandé)

Les e-mails servent au **code de confirmation** à l'inscription, au message de bienvenue, aux annonces d'événements et aux QR codes.

1. Créez un compte gratuit sur <https://agentmail.to>, puis ouvrez la **console**.
2. Créez une **boîte** (« Inbox »), par exemple `snedai-evenements`. Son adresse sera `snedai-evenements@agentmail.to`, et c'est elle qui enverra les e-mails.
3. Dans **API Keys**, créez une clé et copiez-la.
4. Dans Render, ajoutez deux variables :
   - `AGENTMAIL_API_KEY` = la clé ;
   - `AGENTMAIL_INBOX` = l'adresse de la boîte.

Ensuite, faites le test dans **Comptes → « Envoyer un e-mail de test »**.

Si AgentMail est configuré, il est utilisé en priorité. Sinon, le site essaie Brevo, puis un serveur SMTP.

### Étape 2 bis : les e-mails avec Brevo (autre possibilité)

1. Créez un compte sur <https://www.brevo.com>. Choisissez le plan **Free**.
2. Dans **Expéditeurs, domaines et IP dédiées → Expéditeurs**, ajoutez votre adresse e-mail et validez-la avec le lien reçu.
3. Dans **SMTP & API → Clés API**, créez une clé et copiez-la. C'est votre `BREVO_API_KEY`.

Avec une adresse Gmail comme expéditeur, les premiers e-mails peuvent arriver dans les « Spams ». Demandez aux collègues de les marquer « Non spam ». Avec une adresse de l'entreprise (@snedai…), la livraison est meilleure.

### Étape 3 : l'hébergement (Render)

1. Allez sur <https://render.com> et connectez-vous avec **GitHub**.
2. Appuyez sur **New → Web Service**, puis choisissez le dépôt **ChezMaty**.
3. Remplissez les réglages :
   - **Branch** : `main` une fois la pull request fusionnée, ou sinon `claude/snedai-stage-project-7ulwkv`
   - **Root Directory** : `snedai-evenements`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
4. Dans **Environment Variables**, ajoutez seulement trois variables :
   - `ADMIN_EMAILS` = votre adresse Gmail
   - `DATABASE_URL` = l'adresse copiée chez Neon
   - `BREVO_API_KEY` = la clé Brevo

   Le reste se règle tout seul : mode production, clé secrète des sessions (créée dans la base au premier démarrage) et expéditeur des e-mails (votre adresse administrateur). Variables facultatives : `FILIALES` (liste séparée par des `;`), `MAIL_FROM`, `SESSION_SECRET`.
5. Appuyez sur **Deploy**. Render affiche l'adresse du site, du type `https://snedai-evenements.onrender.com`.
   Le site détecte cette adresse tout seul. La variable `APP_URL` ne sert que pour un nom de domaine personnalisé.

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

## Application mobile

Le site est une **application web installable** (PWA) : icône SNEDAI sur l'écran d'accueil, plein écran, page hors connexion. Elle fonctionne sur Android et sur iPhone, **gratuitement** et sans passer par un magasin d'applications.

| Option | Ce que c'est | Coût | Matériel |
|---|---|---|---|
| **1. Installer le site** (déjà prêt) | Chrome : ⋮ puis « Installer l'application ». iPhone : Safari, Partager, puis « Sur l'écran d'accueil ». | Gratuit | Aucun |
| **2. Fichier d'application Android (.apk)** | Le même site emballé dans une vraie application Android, à installer directement, par exemple sur le terminal de scan. | Gratuit | Aucun (outil en ligne) |
| **3. Publication sur Google Play** | L'application dans le magasin Android. | Environ 25 $, une seule fois | Compte Google Play |
| **4. Application iPhone native, publiée sur l'App Store** | Application iOS. | 99 $ par an | **Mac** avec Xcode |

### Générer le fichier Android (.apk), option 2
1. Ouvrez <https://www.pwabuilder.com> et collez l'adresse du site (par exemple `https://snedai-evenements.onrender.com`).
2. Vérifiez que le diagnostic est vert (manifeste, service worker, HTTPS), puis appuyez sur **Package for stores**, **Android**.
3. Renseignez l'identifiant du paquet, par exemple `ci.snedai.evenements`, et le nom « Événements SNEDAI ». Téléchargez l'archive.
4. L'archive contient un fichier **.apk** à installer sur le téléphone ou le terminal, et un fichier `assetlinks.json` avec l'**empreinte SHA-256** du certificat.
5. Dans Render, ajoutez deux variables : `ANDROID_PACKAGE_NAME` (l'identifiant du paquet) et `ANDROID_CERT_SHA256` (l'empreinte). Le site publie alors `/.well-known/assetlinks.json`, et l'application s'ouvre en plein écran, sans barre d'adresse.
6. Installez le .apk sur l'appareil Android (autoriser « sources inconnues » si besoin).

### Plus tard, avec un Mac
Un outil comme **Capacitor** pourra emballer le même site pour iPhone et le tester dans le simulateur Xcode (gratuit). Seule la publication sur l'App Store est payante.

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
