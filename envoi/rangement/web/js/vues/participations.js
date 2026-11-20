/* Les participations à un événement : liste, recherche, export Excel, lien d'inscription et envoi à tous les employés. */
import { api, toutesLesPages } from "../api.js";
import { coque } from "../coque.js";
import { h, notifier, phrases, formaterDate } from "../outils.js";

export async function vueParticipations(id) {
  coque(h("p", { class: "muted" }, "Chargement…"));
  let evenement, participations;
  try {
    [evenement, participations] = await Promise.all([api(`/api/evenements/${id}/`), api(`/api/evenements/${id}/inscriptions/`)]);
  } catch (erreur) { return erreur.statut === 401 ? null : coque(h("div", { class: "alerte" }, phrases(erreur.donnees).join(" "))); }

  const nbPresents = participations.filter((p) => p.present).length;
  const corpsTableau = h("tbody");
  const compteur = h("span", { class: "muted" });
  const recherche = h("input", { type: "search", placeholder: "Rechercher un nom, une filiale, une adresse…" });
  const filtre = h("select", {}, h("option", { value: "tous" }, "Tous"), h("option", { value: "presents" }, "Présents"), h("option", { value: "absents" }, "Absents"));

  function afficherLignes() {
    const mot = recherche.value.trim().toLowerCase();
    const choisis = participations.filter((p) =>
      (filtre.value === "tous" || (filtre.value === "presents") === p.present)
      && (!mot || [p.nom, p.prenom, p.filiale, p.email, p.telephone].join(" ").toLowerCase().includes(mot)));
    compteur.textContent = `${choisis.length} sur ${participations.length}`;
    corpsTableau.replaceChildren(...(choisis.length ? choisis.map((p) => h("tr", {},
      h("td", {}, p.nom), h("td", {}, p.prenom), h("td", {}, p.filiale), h("td", {}, p.email), h("td", {}, p.telephone),
      h("td", {}, p.creneau || "—"),
      h("td", {}, h("span", { class: "badge " + (p.present ? "oui" : "non") }, p.present ? "Présent" : "Absent"))))
      : [h("tr", {}, h("td", { colspan: 7, class: "vide" }, participations.length ? "Aucun résultat." : "Personne ne s'est encore inscrit."))]));
  }
  recherche.addEventListener("input", afficherLignes);
  filtre.addEventListener("change", afficherLignes);

  const exporter = async () => {
    try {
      const reponse = await api(`/api/evenements/${id}/export/`, { fichier: true });
      const nom = (reponse.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/);
      const lien = h("a", { href: URL.createObjectURL(await reponse.blob()), download: nom ? nom[1] : "inscrits.xlsx" });
      document.body.append(lien); lien.click(); lien.remove();
    } catch (erreur) { notifier(phrases(erreur.donnees).join(" "), true); }
  };

  const copier = async () => {
    try { await navigator.clipboard.writeText(evenement.url_inscription); notifier("Lien copié"); }
    catch (erreur) { prompt("Copiez ce lien :", evenement.url_inscription); }
  };

  /* Envoi du lien à tous les employés : un seul bouton, vers la liste de diffusion de l'entreprise. */
  const diffusion = JSON.parse(sessionStorage.getItem("diffusion") || "[]");
  const boutonEnvoi = h("button", { class: "btn", type: "button", disabled: diffusion.length === 0 || !evenement.inscriptions_ouvertes || evenement.complet, onclick: async () => {
    if (!confirm(`Envoyer le lien d'inscription de « ${evenement.nom} » à tous les employés ?`)) return;
    boutonEnvoi.disabled = true;
    try {
      const bilan = await api(`/api/evenements/${id}/inviter/`, { methode: "POST" });
      notifier(`Lien envoyé à ${bilan.envoyes} adresse(s)` + (bilan.deja_inscrits ? `, ${bilan.deja_inscrits} déjà inscrite(s) ignorée(s)` : ""));
    } catch (erreur) { notifier(phrases(erreur.donnees).join(" "), true); }
    finally { boutonEnvoi.disabled = false; }
  } }, "Envoyer le lien à tous les employés");

  const sectionEnvoi = h("div", { class: "carte" }, h("h2", {}, "Informer les employés"),
    h("p", { class: "muted", style: "margin:0 0 .8rem" }, !evenement.inscriptions_ouvertes
      ? "Les inscriptions sont closes : le lien d'inscription a expiré."
      : evenement.complet
      ? "Cet événement est complet : toutes les places sont prises."
      : diffusion.length
      ? "Le lien d'inscription est envoyé par e-mail à tous les employés. Chacun s'inscrit, puis reçoit son QR code par e-mail."
      : "Aucune adresse de diffusion n'est configurée : renseignez ADRESSES_DIFFUSION dans config/settings.py."),
    boutonEnvoi);

  coque(
    h("div", { class: "barre" },
      h("div", {}, h("h1", {}, evenement.nom), h("span", { class: "muted" }, `${formaterDate(evenement.date)} · ${evenement.lieu}`)),
      h("div", { class: "actions" }, h("a", { class: "btn btn-clair", href: "#/" }, "Retour"),
        h("a", { class: "btn btn-clair", href: `#/evenement/${id}/modifier` }, "Modifier"),
        h("button", { class: "btn", type: "button", onclick: exporter }, "Exporter en Excel"))),
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("strong", {}, String(participations.length)), h("span", {}, "Inscrits")),
      h("div", { class: "stat" }, h("strong", {}, String(nbPresents)), h("span", {}, "Présents")),
      h("div", { class: "stat" }, h("strong", {}, String(participations.length - nbPresents)), h("span", {}, "Absents")),
      evenement.places ? h("div", { class: "stat" }, h("strong", {}, String(evenement.places_restantes)), h("span", {}, "Places restantes")) : null),
    h("div", { class: "carte" }, h("h2", {}, "Lien d'inscription"),
      evenement.inscriptions_ouvertes ? null : h("div", { class: "alerte" }, "Ce lien a expiré : les inscriptions sont closes, plus personne ne peut s'inscrire."),
      h("div", { class: "lien-inscription" }, h("code", {}, evenement.url_inscription), h("button", { class: "btn btn-clair btn-petit", type: "button", onclick: copier }, "Copier"))),
    h("div", { class: "carte" }, h("h2", {}, "Participations"),
      h("div", { class: "outils" }, recherche, filtre, compteur),
      h("div", { class: "tableau-conteneur" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Nom", "Prénom", "Filiale", "Adresse e-mail", "Téléphone", "Créneau", "Présence"].map((t) => h("th", {}, t)))),
        corpsTableau))),
    sectionEnvoi);
  afficherLignes();
}
