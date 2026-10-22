# Déploiement public de Chez Maty

## 1) Préparer le domaine

Acheter ou posséder un domaine du type `chezmaty.ci` chez un registrar.

## 2) Déployer le backend sur Render

1. Créer un compte sur Render.
2. Créer un nouveau service `Web Service`.
3. Connecter le dépôt GitHub du projet.
4. Choisir le dossier racine du dépôt.
5. Déployer avec le fichier `render.yaml` déjà préparé.
6. Vérifier l’URL publique affichée par Render (ex. `https://chezmaty-api.onrender.com`).

Le backend initialise son schéma de base de données au démarrage. Le système de fichiers d’un service Render gratuit étant éphémère, ne stockez pas les données réelles de la boutique dans la base SQLite locale : configurez `DATABASE_URL` avec une base persistante avant d’y saisir les données de production.

Au premier démarrage en production, le catalogue de présentation ajoute les photos du projet avec des tarifs estimatifs provisoires. Les produits restent indisponibles à l'achat en ligne et invitent les clients à confirmer prix et disponibilité sur WhatsApp.

Pour envoyer le message de bienvenue et les e-mails de récupération, configurez un service SMTP dans Render. Pour Gmail, utilisez `smtp.gmail.com`, le port `587`, l'adresse Gmail comme `SMTP_USERNAME` et `SMTP_FROM_EMAIL`, ainsi qu'un mot de passe d'application Google dans `SMTP_PASSWORD` (pas le mot de passe normal du compte). Activez `SMTP_USE_TLS=true`. Sans ces paramètres, l'inscription fonctionne mais l'API indique que l'e-mail de bienvenue n'a pas été envoyé.

Les boutons de connexion Google et Apple restent désactivés tant que leurs clients OAuth ne sont pas configurés. Cela nécessite un client OAuth Google et un identifiant de service Apple, ainsi que leurs secrets conservés dans les variables privées Render; ne collez jamais ces secrets dans le code ni dans une conversation.

## 3) Déployer le frontend sur Netlify

1. Créer un compte sur Netlify.
2. Importer le dépôt GitHub.
3. Définir le dossier de publication : `frontend`.
4. Laisser la commande de build vide, car ce site est statique.
5. Déployer.

## 4) Configurer l’API publique du frontend

Dans chaque page HTML, ou dans un script global, définir :

```html
<script>
  window.CHEZ_MATY_API_URL = 'https://chezmaty-api.onrender.com/api';
</script>
```

Le fichier [frontend/js/app.js](frontend/js/app.js) utilise déjà `window.CHEZ_MATY_API_URL` lorsque cette variable est présente.

## 5) Configurer le domaine principal

Dans Netlify, ajouter le domaine custom : `chezmaty.ci`.
Dans Render, configurer le domaine ou utiliser un sous-domaine dédié.

## 6) Vérifier

- Frontend : `https://chezmaty.ci`
- API : `https://chezmaty-api.onrender.com/health`

## 7) Paiement en ligne

Le panier crée la commande puis redirige le client vers CinetPay Checkout. Le statut n'est jamais déduit de la page de retour : l'API demande confirmation à CinetPay avant de marquer la commande comme payée.

### Configuration CinetPay

Dans les paramètres d'environnement du service Render, définir :

- `CINETPAY_API_KEY` : clé API privée du compte CinetPay.
- `CINETPAY_API_PASSWORD` : mot de passe API défini dans **Ressources → API & sécurité**.
- `PAYMENT_PUBLIC_API_URL` : URL HTTPS publique de l'API Render, par exemple `https://chezmaty-api.onrender.com` (sans `/api` final).
- `FRONTEND_URL` : origine HTTPS Netlify ou domaine du site, sans chemin, par exemple `https://chezmaty.ci`.
- `PAYMENT_SANDBOX` : `true` avec la clé `sk_test_...` pour les essais; `false` uniquement avec la clé `sk_live_...` pour les vrais paiements.

En Sandbox, Chez Maty utilise `https://api.cinetpay.net`; en production, `https://api.cinetpay.co`. Le backend choisit l'adresse à partir de `PAYMENT_SANDBOX`. Les mêmes variables peuvent être définies dans un fichier `.env` local pour les essais. Ne pas committer ce fichier ni intégrer les clés dans le frontend.

À la création d'un paiement, l'API enregistre le jeton de notification fourni par CinetPay. CinetPay doit pouvoir appeler `https://<api-publique>/api/payments/cinetpay/notify`; le backend vérifie le jeton puis confirme le statut, le montant et la devise directement auprès de CinetPay avant de marquer la commande comme payée. Au retour du checkout, le navigateur interroge également l'API avec la session du client. Le client peut réessayer un paiement non confirmé depuis la page panier.

Le service Render gratuit utilise un système de fichiers éphémère. Avant tout encaissement réel, configure une base de données persistante pour que les commandes et confirmations de paiement survivent aux redémarrages.

## 8) Connexion Google et Apple

Le formulaire de compte active automatiquement chaque bouton quand ses identifiants sont configurés dans Render. Les retours OAuth sont traités par l'API, qui vérifie le jeton signé, l'audience, le nonce et l'adresse e-mail confirmée avant d'ouvrir la session Chez Maty.

Dans les réglages d'environnement du service Render, ajoute :

- Google : `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET`.
- Apple : `APPLE_OAUTH_CLIENT_ID` (Services ID), `APPLE_OAUTH_TEAM_ID`, `APPLE_OAUTH_KEY_ID` et `APPLE_OAUTH_PRIVATE_KEY` (contenu PEM de la clé `.p8`; conserver les retours à la ligne ou les remplacer par `\\n`).
- Vérifie que `PAYMENT_PUBLIC_API_URL` contient l'origine HTTPS publique de l'API Render, sans `/api` final.

Enregistre l'URL de retour exacte `https://chezmaty-api.onrender.com/api/auth/google/callback` dans le client OAuth Web de Google et `https://chezmaty-api.onrender.com/api/auth/apple/callback` dans la configuration du Services ID Apple. Le domaine de retour doit aussi être enregistré côté Apple. Apple exige un compte Apple Developer et un App ID principal associé au Services ID. N'expose jamais les secrets dans le frontend ni dans Git.

Les comptes sociaux dont l'adresse e-mail est confirmée sont reliés au compte Chez Maty correspondant. La première connexion crée sinon un compte client. Les comptes existants dont le fournisseur confirme la même adresse sont reliés automatiquement.
