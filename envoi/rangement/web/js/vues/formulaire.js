/* Créer ou modifier un événement : nom, date, horaires (sélecteurs), lieu (liste avec recherche), date limite, places. */
import { api, toutesLesPages } from "../api.js";
import { coque } from "../coque.js";
import { h, notifier, phrases, versChampLocal } from "../outils.js";

export async function vueFormulaire(id) {
  coque(h("p", { class: "muted" }, "Chargement…"));
  let evenement = { nom: "", date: "", lieu: "", description: "", creneaux: [], inscriptions_jusqu_au: null, places: null };
  let lieux;
  try {
    [lieux, evenement] = await Promise.all([toutesLesPages("/api/lieux/"), id ? api(`/api/evenements/${id}/`) : Promise.resolve(evenement)]);
  } catch (erreur) { return erreur.statut === 401 ? null : coque(h("div", { class: "alerte" }, phrases(erreur.donnees).join(" "))); }

  const zoneErreur = h("div", { class: "alerte", hidden: true });
  const erreursChamps = {};
  const champ = (nom, etiquette, saisie, aide) => {
    erreursChamps[nom] = h("div", { class: "erreur" });
    return h("div", { class: "champ" }, h("label", { for: nom }, etiquette), saisie, aide ? h("div", { class: "aide" }, aide) : null, erreursChamps[nom]);
  };

  /* --- Le lieu : une liste de choix où l'on peut aussi TAPER pour retrouver un site (les lieux se gèrent dans la page « Lieux ») --- */
  const choixLieu = h("input", { id: "lieu", name: "lieu", list: "liste-lieux", required: true, autocomplete: "off", placeholder: "Choisir ou taper un lieu…", value: evenement.lieu });
  const listeLieux = h("datalist", { id: "liste-lieux" }, ...lieux.map((lieu) => h("option", { value: lieu.nom })));

  /* --- Les horaires : un sélecteur d'heure pour le début et pour la fin (4 créneaux au maximum) --- */
  const listeCreneaux = h("div", { id: "creneaux" });
  const lignes = [];
  const boutonAjoutCreneau = h("button", { class: "btn btn-clair btn-petit", type: "button", onclick: () => { ajouterCreneau("", ""); } }, "Ajouter un horaire");
  const majBoutonCreneau = () => { boutonAjoutCreneau.disabled = lignes.length >= 4; };
  function ajouterCreneau(debut, fin) {
    const champDebut = h("input", { type: "time", "aria-label": "Heure de début", value: debut, required: true });
    const champFin = h("input", { type: "time", "aria-label": "Heure de fin", value: fin, required: true });
    const ligne = h("div", { class: "ligne-creneau" }, h("span", {}, "De"), champDebut, h("span", {}, "à"), champFin,
      h("button", { class: "btn btn-danger btn-petit", type: "button", onclick: () => {
        lignes.splice(lignes.findIndex((l) => l.element === ligne), 1);
        ligne.remove();
        majBoutonCreneau();
      } }, "Retirer"));
    lignes.push({ element: ligne, champDebut, champFin });
    listeCreneaux.append(ligne);
    majBoutonCreneau();
  }
  evenement.creneaux.forEach((creneau) => { const [debut, fin] = creneau.split("-"); ajouterCreneau(debut, fin); });

  const aujourdhui = new Date().toLocaleDateString("fr-CA");           /* AAAA-MM-JJ : pas de jour passé pour un nouvel événement */
  const bouton = h("button", { class: "btn", type: "submit" }, id ? "Enregistrer les modifications" : "Créer l'événement");
  const formulaire = h("form", { class: "formulaire", onsubmit: async (evenementForm) => {
    evenementForm.preventDefault();
    zoneErreur.hidden = true;
    Object.values(erreursChamps).forEach((zone) => { zone.textContent = ""; });
    const f = Object.fromEntries(new FormData(formulaire));
    const saisi = f.lieu.trim().toLowerCase();
    const lieu = lieux.find((l) => l.nom.toLowerCase() === saisi);
    if (!lieu) { erreursChamps.lieu.textContent = "Choisissez un lieu de la liste (ajoutez-le d'abord dans la page « Lieux » s'il n'existe pas)."; choixLieu.focus(); return; }
    const corps = { nom: f.nom, date: f.date, lieu: lieu.nom, description: f.description,
      creneaux: lignes.map((l) => `${l.champDebut.value}-${l.champFin.value}`),
      inscriptions_jusqu_au: f.inscriptions_jusqu_au ? new Date(f.inscriptions_jusqu_au).toISOString() : null,
      places: f.places ? Number(f.places) : null };
    bouton.disabled = true;
    try {
      await api(id ? `/api/evenements/${id}/` : "/api/evenements/", { methode: id ? "PUT" : "POST", corps });
      notifier(id ? "Événement modifié" : "Événement créé");
      location.hash = "#/";
    } catch (erreur) {
      const autres = [];
      for (const [nomChamp, messages] of Object.entries(erreur.donnees || {})) {
        const texte = Array.isArray(messages) ? messages.join(" ") : String(messages);
        if (erreursChamps[nomChamp]) erreursChamps[nomChamp].textContent = texte; else autres.push(texte);
      }
      if (autres.length || !erreur.donnees) { zoneErreur.textContent = autres.join(" ") || "Une erreur est survenue."; zoneErreur.hidden = false; }
    } finally {
      bouton.disabled = false;
    }
  } },
    champ("nom", "Nom de l'événement", h("input", { id: "nom", name: "nom", required: true, maxlength: 150, value: evenement.nom })),
    h("div", { class: "grille-2" },
      champ("date", "Date", h("input", { id: "date", name: "date", type: "date", required: true, value: evenement.date, min: id ? null : aujourdhui })),
      champ("creneaux", "Horaires", h("div", {}, listeCreneaux, boutonAjoutCreneau), "Sans horaire, l'événement dure toute la journée (4 horaires au maximum).")),
    champ("lieu", "Lieu", h("div", {}, choixLieu, listeLieux), "Cliquez pour voir la liste ou tapez quelques lettres pour retrouver le site."),
    champ("description", "Description", h("textarea", { id: "description", name: "description", rows: 4 }, evenement.description)),
    h("div", { class: "grille-2" },
      champ("inscriptions_jusqu_au", "Date limite d'inscription (facultatif)",
        h("input", { id: "inscriptions_jusqu_au", name: "inscriptions_jusqu_au", type: "datetime-local", value: versChampLocal(evenement.inscriptions_jusqu_au) }),
        "Après cette date, le lien expire. Sans date limite : jusqu'à la fin de l'événement."),
      champ("places", "Nombre de places (facultatif)",
        h("input", { id: "places", name: "places", type: "number", min: 1, step: 1, value: evenement.places || "" }),
        "Quand toutes les places sont prises, plus personne ne s'inscrit.")),
    h("div", { class: "actions" }, bouton, h("a", { class: "btn btn-clair", href: "#/" }, "Annuler")));

  coque(h("div", { class: "barre" }, h("h1", {}, id ? "Modifier l'événement" : "Nouvel événement")),
    h("div", { class: "carte" }, zoneErreur, formulaire));
}
