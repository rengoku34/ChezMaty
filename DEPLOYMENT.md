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

Le paiement en ligne ne sera visible et fonctionnel qu’après l’intégration du vrai fournisseur de paiement et la configuration de ses clés API.
