/* La page de connexion de l'administrateur. */
import { api, crochets, viderSession } from "../api.js";
import { racine } from "../coque.js";
import { h, phrases } from "../outils.js";

export function vueConnexion() {
  const zoneErreur = h("div", { class: "alerte", hidden: true });
  const bouton = h("button", { class: "btn", type: "submit", style: "width:100%" }, "Se connecter");
  const formulaire = h("form", { class: "formulaire", style: "max-width:none", onsubmit: async (evenement) => {
    evenement.preventDefault();
    zoneErreur.hidden = true;
    bouton.disabled = true;
    try {
      const donnees = { username: formulaire.username.value.trim(), password: formulaire.password.value };
      const reponse = await api("/api/auth/token/", { methode: "POST", corps: donnees });
      sessionStorage.setItem("jeton", reponse.token);
      const moi = await api("/api/auth/moi/");
      if (moi.role !== "administrateur") {
        await viderSession();
        throw { donnees: { detail: "Cette application est réservée à l'administrateur." } };
      }
      sessionStorage.setItem("nom", moi.username);
      sessionStorage.setItem("diffusion", JSON.stringify(moi.diffusion || []));
      location.hash = "#/";
      crochets.routeur();
    } catch (erreur) {
      zoneErreur.textContent = erreur.statut === 400 ? "Identifiant ou mot de passe incorrect." : phrases(erreur.donnees).join(" ");
      zoneErreur.hidden = false;
    } finally {
      bouton.disabled = false;
    }
  } },
    h("div", { class: "champ" }, h("label", { for: "username" }, "Identifiant"),
      h("input", { id: "username", name: "username", required: true, autofocus: true, autocomplete: "username", autocapitalize: "none" })),
    h("div", { class: "champ" }, h("label", { for: "password" }, "Mot de passe"),
      h("input", { id: "password", name: "password", type: "password", required: true, autocomplete: "current-password" })),
    bouton);
  racine.replaceChildren(h("main", { class: "page" }, h("div", { class: "connexion" },
    h("div", { class: "marque" }, h("span", { class: "logo grand" }, h("img", { src: "img/logo.png", alt: "SNEDAI" }))),
    h("div", { class: "carte" }, h("h2", {}, "Connexion"), zoneErreur, formulaire,
      h("p", { class: "muted", style: "font-size:.85rem;margin:1rem 0 0" }, "Réservé à l'administrateur.")))));
}
