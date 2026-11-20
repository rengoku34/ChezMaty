/*
  Application WEB : gestion des événements par l'administrateur.
  Elle parle au BACKEND (l'API Django) : connexion par jeton, création / lecture / modification / suppression des événements,
  participations, export Excel et envoi du lien par e-mail à tous les employés.

  Organisation :  main.js (les pages)  ·  api.js (dialogue avec le backend)  ·  outils.js (petits outils)  ·  coque.js (en-tête commun)  ·  vues/ (une page par fichier)
*/
import { crochets } from "./api.js";
import { vueConnexion } from "./vues/connexion.js";
import { vueEvenements } from "./vues/evenements.js";
import { vueFormulaire } from "./vues/formulaire.js";
import { vueLieux } from "./vues/lieux.js";
import { vueParticipations } from "./vues/participations.js";

/* Une « page » par adresse après le # */
function routeur() {
  const adresse = location.hash.replace(/^#/, "") || "/";
  if (!sessionStorage.getItem("jeton")) return vueConnexion();
  let m;
  if (adresse === "/") return vueEvenements();
  if (adresse === "/lieux") return vueLieux();
  if (adresse === "/evenement/nouveau") return vueFormulaire(null);
  if ((m = adresse.match(/^\/evenement\/(\d+)\/modifier$/))) return vueFormulaire(Number(m[1]));
  if ((m = adresse.match(/^\/evenement\/(\d+)\/participations$/))) return vueParticipations(Number(m[1]));
  location.hash = "#/";
}

crochets.routeur = routeur;
window.addEventListener("hashchange", routeur);
routeur();
