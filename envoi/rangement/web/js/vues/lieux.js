/* La page des lieux : ajouter, renommer, supprimer. Ces lieux alimentent la liste de choix du formulaire d'événement. */
import { api, toutesLesPages } from "../api.js";
import { coque } from "../coque.js";
import { h, notifier, phrases } from "../outils.js";

export async function vueLieux() {
  coque(h("p", { class: "muted" }, "Chargement…"));
  let lieux;
  try { lieux = await toutesLesPages("/api/lieux/"); } catch (erreur) { return erreur.statut === 401 ? null : coque(h("div", { class: "alerte" }, phrases(erreur.donnees).join(" "))); }

  let enEdition = null;
  const zoneErreur = h("div", { class: "alerte", hidden: true });
  const corpsTableau = h("tbody");
  const montrer = (erreur) => {
    zoneErreur.textContent = erreur.donnees && erreur.donnees.nom ? erreur.donnees.nom.join(" ") : phrases(erreur.donnees).join(" ");
    zoneErreur.hidden = false;
  };
  const recharger = async () => {
    try { lieux = await toutesLesPages("/api/lieux/"); enEdition = null; afficher(); } catch (erreur) { if (erreur.statut !== 401) montrer(erreur); }
  };

  function ligneNormale(lieu) {
    return h("tr", {},
      h("td", {}, h("strong", {}, lieu.nom)),
      h("td", {}, String(lieu.nombre_evenements)),
      h("td", {}, h("div", { class: "actions" },
        h("button", { class: "btn btn-clair btn-petit", type: "button", onclick: () => { enEdition = lieu.id; zoneErreur.hidden = true; afficher(); } }, "Modifier"),
        h("button", { class: "btn btn-danger btn-petit", type: "button", onclick: async () => {
          if (!confirm(`Supprimer le lieu « ${lieu.nom} » ?`)) return;
          try { await api(`/api/lieux/${lieu.id}/`, { methode: "DELETE" }); notifier("Lieu supprimé"); zoneErreur.hidden = true; await recharger(); }
          catch (erreur) { montrer(erreur); }
        } }, "Supprimer"))));
  }

  function ligneEdition(lieu) {
    const saisie = h("input", { value: lieu.nom, maxlength: 200, "aria-label": "Nom du lieu" });
    const enregistrer = async () => {
      try { await api(`/api/lieux/${lieu.id}/`, { methode: "PATCH", corps: { nom: saisie.value } }); notifier("Lieu modifié"); zoneErreur.hidden = true; await recharger(); }
      catch (erreur) { montrer(erreur); }
    };
    saisie.addEventListener("keydown", (e) => { if (e.key === "Enter") enregistrer(); if (e.key === "Escape") { enEdition = null; afficher(); } });
    setTimeout(() => saisie.focus(), 0);
    return h("tr", {}, h("td", {}, saisie), h("td", {}, String(lieu.nombre_evenements)),
      h("td", {}, h("div", { class: "actions" },
        h("button", { class: "btn btn-petit", type: "button", onclick: enregistrer }, "Enregistrer"),
        h("button", { class: "btn btn-clair btn-petit", type: "button", onclick: () => { enEdition = null; zoneErreur.hidden = true; afficher(); } }, "Annuler"))));
  }

  function afficher() {
    corpsTableau.replaceChildren(...(lieux.length
      ? lieux.map((lieu) => (lieu.id === enEdition ? ligneEdition(lieu) : ligneNormale(lieu)))
      : [h("tr", {}, h("td", { colspan: 3, class: "vide" }, "Aucun lieu pour l'instant. Ajoutez le premier ci-dessus."))]));
  }

  const nouveau = h("input", { id: "nouveau-lieu", maxlength: 200, placeholder: "Ex. : Salle Plateau, Siège du Groupe…", "aria-label": "Nom du nouveau lieu" });
  const formulaire = h("form", { class: "ligne-lieu", onsubmit: async (evenement) => {
    evenement.preventDefault();
    if (!nouveau.value.trim()) return;
    try { await api("/api/lieux/", { methode: "POST", corps: { nom: nouveau.value } }); nouveau.value = ""; zoneErreur.hidden = true; notifier("Lieu ajouté"); await recharger(); }
    catch (erreur) { montrer(erreur); }
  } }, nouveau, h("button", { class: "btn", type: "submit" }, "Ajouter le lieu"));

  afficher();
  coque(
    h("div", { class: "barre" }, h("div", {}, h("h1", {}, "Lieux"), h("span", { class: "muted" }, "Les endroits où se tiennent les événements : on les choisit dans une liste en créant un événement."))),
    h("div", { class: "carte" }, zoneErreur, formulaire,
      h("div", { class: "tableau-conteneur" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Lieu", "Événements", "Actions"].map((t) => h("th", {}, t)))),
        corpsTableau))));
}
