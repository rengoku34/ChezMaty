/* Le dialogue avec le BACKEND : tous les appels à l'API passent ici (le jeton est ajouté automatiquement). */
const API = "";        /* le site et l'API sont sur le même serveur : les appels commencent par /api/ */

/* Rempli par main.js : ce que l'on fait quand la session est terminée ou quand on se déconnecte. */
export const crochets = { routeur: () => {} };

export async function api(chemin, { methode = "GET", corps, fichier = false } = {}) {
  const entetes = {};
  if (corps !== undefined) entetes["Content-Type"] = "application/json";
  const jeton = sessionStorage.getItem("jeton");
  if (jeton) entetes.Authorization = `Token ${jeton}`;
  let reponse;
  try {
    reponse = await fetch(API + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  } catch (erreur) {
    throw { statut: 0, donnees: { detail: "Connexion au serveur impossible. Vérifiez que le backend est lancé." } };
  }
  if (reponse.status === 401 && jeton) {
    sessionStorage.removeItem("jeton");
    location.hash = "#/";
    crochets.routeur();
    throw { statut: 401, donnees: { detail: "Session expirée : reconnectez-vous." } };
  }
  if (fichier && reponse.ok) return reponse;
  let donnees = null;
  try { donnees = await reponse.json(); } catch (erreur) { /* pas de contenu (suppression réussie par exemple) */ }
  if (!reponse.ok) throw { statut: reponse.status, donnees };
  return donnees;
}

/* Récupère toutes les pages d'une liste (l'API renvoie 20 éléments par page). */
export async function toutesLesPages(chemin) {
  let resultats = [];
  let suivant = chemin;
  while (suivant) {
    const page = await api(suivant);
    resultats = resultats.concat(page.results);
    suivant = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
  }
  return resultats;
}

/* Supprime le jeton (sur le serveur et ici) sans changer d'écran. */
export async function viderSession() {
  try { await api("/api/auth/deconnexion/", { methode: "POST" }); } catch (erreur) { /* le jeton est supprimé de toute façon */ }
  sessionStorage.clear();
}
