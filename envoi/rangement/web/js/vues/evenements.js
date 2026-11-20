/* La liste des événements : voir, modifier, supprimer, ouvrir les participations. */
import { api, toutesLesPages } from "../api.js";
import { coque } from "../coque.js";
import { h, notifier, phrases, formaterDate } from "../outils.js";

export async function vueEvenements() {
  coque(h("p", { class: "muted" }, "Chargement…"));
  let evenements;
  try { evenements = await toutesLesPages("/api/evenements/"); } catch (erreur) { return erreur.statut === 401 ? null : coque(h("div", { class: "alerte" }, phrases(erreur.donnees).join(" "))); }

  const supprimer = async (evenement) => {
    if (!confirm(`Supprimer l'événement « ${evenement.nom} » ?\nSes ${evenement.nombre_inscrits} inscription(s) seront aussi supprimées.`)) return;
    try { await api(`/api/evenements/${evenement.id}/`, { methode: "DELETE" }); notifier("Événement supprimé"); vueEvenements(); }
    catch (erreur) { notifier(phrases(erreur.donnees).join(" "), true); }
  };

  const lignes = evenements.map((e) => h("tr", {},
    h("td", {}, h("strong", {}, e.nom), e.inscriptions_ouvertes ? null : h("span", { class: "badge non", style: "margin-left:.5rem" }, "Inscriptions closes")),
    h("td", {}, formaterDate(e.date)),
    h("td", {}, e.lieu),
    h("td", {}, e.places ? `${e.nombre_inscrits} / ${e.places}` : String(e.nombre_inscrits),
      e.complet ? h("span", { class: "badge non", style: "margin-left:.5rem" }, "Complet") : null),
    h("td", {}, String(e.nombre_presents)),
    h("td", {}, h("div", { class: "actions" },
      h("a", { class: "btn btn-clair btn-petit", href: `#/evenement/${e.id}/participations` }, "Participations"),
      h("a", { class: "btn btn-clair btn-petit", href: `#/evenement/${e.id}/modifier` }, "Modifier"),
      h("button", { class: "btn btn-danger btn-petit", type: "button", onclick: () => supprimer(e) }, "Supprimer")))));

  coque(
    h("div", { class: "barre" }, h("div", {}, h("h1", {}, "Événements"), h("span", { class: "muted" }, `${evenements.length} événement(s)`)),
      h("a", { class: "btn", href: "#/evenement/nouveau" }, "Nouvel événement")),
    h("div", { class: "carte" }, evenements.length === 0
      ? h("div", { class: "vide" }, "Aucun événement pour l'instant. Créez le premier avec le bouton « Nouvel événement ».")
      : h("div", { class: "tableau-conteneur" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Événement", "Date", "Lieu", "Inscrits", "Présents", "Actions"].map((t) => h("th", {}, t)))),
        h("tbody", {}, lignes)))));
}
