/* La structure commune des pages : l'en-tête (logo, menu, déconnexion) et la zone de contenu. */
import { crochets, viderSession } from "./api.js";
import { h } from "./outils.js";

export const racine = document.getElementById("app");

export function coque(...contenu) {
  const entete = h("header", { class: "entete" },
    h("a", { class: "marque", href: "#/" }, h("span", { class: "logo" }, h("img", { src: "img/logo.png", alt: "SNEDAI" }))),
    h("nav", { class: "menu" }, h("a", { href: "#/" }, "Événements"), h("a", { href: "#/lieux" }, "Lieux")),
    h("div", { class: "droite" },
      h("span", {}, sessionStorage.getItem("nom") || ""),
      h("button", { class: "lien-bouton", type: "button", onclick: deconnecter }, "Déconnexion")));
  racine.replaceChildren(entete, h("main", { class: "page" }, ...contenu));
}

async function deconnecter() {
  await viderSession();
  location.hash = "#/";
  crochets.routeur();
}
