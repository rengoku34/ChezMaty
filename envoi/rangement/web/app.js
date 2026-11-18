/*
  Application WEB : gestion des événements par l'administrateur.
  Elle parle au BACKEND (l'API Django) : connexion par jeton, création / lecture / modification / suppression
  des événements, liste des participants, export Excel et envoi du lien par e-mail à tous les employés.
  Le site et l'API sont servis par le même serveur : les appels commencent par /api/, rien à configurer.
*/
(() => {
  const API = "";        /* le site et l'API sont sur le même serveur : les appels commencent par /api/ */
  const racine = document.getElementById("app");
  const boiteMessage = document.getElementById("toast");

  /* ------------------------------------------------------------------ outils ------------------------------------------------------------------ */

  /* Fabrique un élément HTML : h("div", {class: "carte"}, "texte", autreElement). Le texte est toujours inséré
     comme TEXTE (jamais comme HTML), donc une donnée saisie par un employé ne peut pas casser la page. */
  function h(balise, attributs = {}, ...enfants) {
    const element = document.createElement(balise);
    for (const [nom, valeur] of Object.entries(attributs)) {
      if (nom === "class") element.className = valeur;
      else if (nom.startsWith("on")) element.addEventListener(nom.slice(2), valeur);
      else if (valeur !== false && valeur != null) element.setAttribute(nom, valeur === true ? "" : valeur);
    }
    for (const enfant of enfants.flat()) {
      if (enfant != null && enfant !== false) element.append(enfant.nodeType ? enfant : document.createTextNode(String(enfant)));
    }
    return element;
  }

  let minuteurMessage = null;
  function notifier(texte, erreur = false) {
    boiteMessage.textContent = texte;
    boiteMessage.className = "visible" + (erreur ? " erreur" : "");
    clearTimeout(minuteurMessage);
    minuteurMessage = setTimeout(() => { boiteMessage.className = ""; }, 3500);
  }

  const formaterDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

  /* Transforme la réponse d'erreur de l'API en phrases lisibles. */
  function phrases(donnees) {
    if (!donnees) return ["Une erreur est survenue."];
    if (typeof donnees === "string") return [donnees];
    const lignes = [];
    for (const [champ, messages] of Object.entries(donnees)) {
      const texte = Array.isArray(messages) ? messages.join(" ") : String(messages);
      lignes.push(champ === "detail" || champ === "non_field_errors" ? texte : `${champ} : ${texte}`);
    }
    return lignes;
  }

  /* ------------------------------------------------------------------ dialogue avec l'API ------------------------------------------------------------------ */

  async function api(chemin, { methode = "GET", corps, fichier = false } = {}) {
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
      routeur();
      throw { statut: 401, donnees: { detail: "Session expirée : reconnectez-vous." } };
    }
    if (fichier && reponse.ok) return reponse;
    let donnees = null;
    try { donnees = await reponse.json(); } catch (erreur) { /* pas de contenu (suppression réussie par exemple) */ }
    if (!reponse.ok) throw { statut: reponse.status, donnees };
    return donnees;
  }

  /* Récupère toutes les pages d'une liste (l'API renvoie 20 éléments par page). */
  async function toutesLesPages(chemin) {
    let resultats = [];
    let suivant = chemin;
    while (suivant) {
      const page = await api(suivant);
      resultats = resultats.concat(page.results);
      suivant = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
    }
    return resultats;
  }

  /* ------------------------------------------------------------------ structure commune ------------------------------------------------------------------ */

  function coque(...contenu) {
    const entete = h("header", { class: "entete" },
      h("a", { class: "marque", href: "#/" }, h("span", { class: "logo" }, h("img", { src: "logo.png", alt: "SNEDAI" }))),
      h("nav", { class: "menu" }, h("a", { href: "#/" }, "Événements"), h("a", { href: "#/lieux" }, "Lieux")),
      h("div", { class: "droite" },
        h("span", {}, sessionStorage.getItem("nom") || ""),
        h("button", { class: "lien-bouton", type: "button", onclick: deconnecter }, "Déconnexion")));
    racine.replaceChildren(entete, h("main", { class: "page" }, ...contenu));
  }

  /* Supprime le jeton (sur le serveur et ici) sans changer d'écran. */
  async function viderSession() {
    try { await api("/api/auth/deconnexion/", { methode: "POST" }); } catch (erreur) { /* le jeton est supprimé de toute façon */ }
    sessionStorage.clear();
  }

  async function deconnecter() {
    await viderSession();
    location.hash = "#/";
    routeur();
  }

  /* ------------------------------------------------------------------ vue : connexion ------------------------------------------------------------------ */

  function vueConnexion() {
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
        routeur();
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
      h("div", { class: "marque" }, h("span", { class: "logo grand" }, h("img", { src: "logo.png", alt: "SNEDAI" }))),
      h("div", { class: "carte" }, h("h2", {}, "Connexion"), zoneErreur, formulaire,
        h("p", { class: "muted", style: "font-size:.85rem;margin:1rem 0 0" }, "Réservé à l'administrateur.")))));
  }

  /* ------------------------------------------------------------------ vue : liste des événements ------------------------------------------------------------------ */

  async function vueEvenements() {
    coque(h("p", { class: "muted" }, "Chargement…"));
    let evenements;
    try { evenements = await toutesLesPages("/api/evenements/"); } catch (erreur) { return erreur.statut === 401 ? null : coque(h("div", { class: "alerte" }, phrases(erreur.donnees).join(" "))); }

    const supprimer = async (evenement) => {
      if (!confirm(`Supprimer l'événement « ${evenement.nom} » ?\nSes ${evenement.nombre_inscrits} inscription(s) seront aussi supprimées.`)) return;
      try { await api(`/api/evenements/${evenement.id}/`, { methode: "DELETE" }); notifier("Événement supprimé"); vueEvenements(); }
      catch (erreur) { notifier(phrases(erreur.donnees).join(" "), true); }
    };

    const lignes = evenements.map((e) => h("tr", {},
      h("td", {}, h("strong", {}, e.nom), e.inscriptions_ouvertes ? null : h("span", { class: "badge non", style: "margin-left:.5rem" }, "Terminé")),
      h("td", {}, formaterDate(e.date)),
      h("td", {}, e.lieu),
      h("td", {}, String(e.nombre_inscrits)),
      h("td", {}, String(e.nombre_presents)),
      h("td", {}, h("div", { class: "actions" },
        h("a", { class: "btn btn-clair btn-petit", href: `#/evenement/${e.id}/participants` }, "Participants"),
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

  /* ------------------------------------------------------------------ vue : créer / modifier un événement ------------------------------------------------------------------ */

  async function vueFormulaire(id) {
    coque(h("p", { class: "muted" }, "Chargement…"));
    let evenement = { nom: "", date: "", lieu: "", description: "", creneaux: [] };
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

    /* --- Le lieu : on le CHOISIT dans une liste ; s'il n'y est pas, on l'ajoute ici même --- */
    const choixLieu = h("select", { id: "lieu", name: "lieu", required: true });
    const remplirLieux = (selection) => {
      choixLieu.replaceChildren(h("option", { value: "" }, lieux.length ? "Choisir un lieu…" : "Aucun lieu : ajoutez-en un ci-dessous"),
        ...lieux.map((lieu) => h("option", { value: lieu.nom }, lieu.nom)));
      choixLieu.value = selection || "";
    };
    remplirLieux(evenement.lieu);
    const nouveauLieu = h("input", { id: "nouveau-lieu", maxlength: 200, placeholder: "Nom du nouveau lieu" });
    const ajouterLieu = async () => {
      const nom = nouveauLieu.value.trim();
      if (!nom) return;
      try {
        const lieu = await api("/api/lieux/", { methode: "POST", corps: { nom } });
        lieux.push(lieu);
        lieux.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
        remplirLieux(lieu.nom);
        nouveauLieu.value = "";
        zoneNouveauLieu.hidden = true;
        erreursChamps.lieu.textContent = "";
        notifier("Lieu ajouté");
      } catch (erreur) {
        erreursChamps.lieu.textContent = erreur.donnees && erreur.donnees.nom ? erreur.donnees.nom.join(" ") : phrases(erreur.donnees).join(" ");
      }
    };
    const zoneNouveauLieu = h("div", { class: "ligne-lieu", hidden: lieux.length > 0 }, nouveauLieu,
      h("button", { class: "btn btn-clair", type: "button", onclick: ajouterLieu }, "Ajouter ce lieu"));
    const lienNouveauLieu = h("button", { class: "lien-texte", type: "button", onclick: () => { zoneNouveauLieu.hidden = !zoneNouveauLieu.hidden; if (!zoneNouveauLieu.hidden) nouveauLieu.focus(); } },
      "Le lieu n'est pas dans la liste ? Ajouter un lieu");

    /* --- Les créneaux : un sélecteur d'heure pour le début et pour la fin (4 au maximum) --- */
    const listeCreneaux = h("div", { id: "creneaux" });
    const lignes = [];
    const boutonAjoutCreneau = h("button", { class: "btn btn-clair btn-petit", type: "button", onclick: () => { ajouterCreneau("", ""); } }, "Ajouter un créneau");
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

    const aujourdhui = new Date().toLocaleDateString("fr-CA");           /* AAAA-MM-JJ : on ne peut pas choisir un jour passé pour un nouvel événement */
    const bouton = h("button", { class: "btn", type: "submit" }, id ? "Enregistrer les modifications" : "Créer l'événement");
    const formulaire = h("form", { class: "formulaire", onsubmit: async (evenementForm) => {
      evenementForm.preventDefault();
      zoneErreur.hidden = true;
      Object.values(erreursChamps).forEach((zone) => { zone.textContent = ""; });
      const f = Object.fromEntries(new FormData(formulaire));
      const corps = { nom: f.nom, date: f.date, lieu: f.lieu, description: f.description,
        creneaux: lignes.map((l) => `${l.champDebut.value}-${l.champFin.value}`) };
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
      champ("date", "Date", h("input", { id: "date", name: "date", type: "date", required: true, value: evenement.date, min: id ? null : aujourdhui }), "Cliquez sur le champ pour choisir le jour dans le calendrier."),
      champ("lieu", "Lieu", h("div", {}, choixLieu, h("div", { style: "margin-top:.4rem" }, lienNouveauLieu), zoneNouveauLieu),
        "Les lieux se gèrent aussi dans la page « Lieux » (ajouter, renommer, supprimer)."),
      champ("description", "Description", h("textarea", { id: "description", name: "description", rows: 4 }, evenement.description)),
      champ("creneaux", "Créneaux horaires", h("div", {}, listeCreneaux, boutonAjoutCreneau),
        "Choisissez l'heure de début et de fin de chaque créneau (4 au maximum). Sans créneau, l'événement dure toute la journée."),
      h("div", { class: "actions" }, bouton, h("a", { class: "btn btn-clair", href: "#/" }, "Annuler")));

    coque(h("div", { class: "barre" }, h("h1", {}, id ? "Modifier l'événement" : "Nouvel événement")),
      h("div", { class: "carte" }, zoneErreur, formulaire));
  }

  /* ------------------------------------------------------------------ vue : les lieux (ajouter, renommer, supprimer) ------------------------------------------------------------------ */

  async function vueLieux() {
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

  /* ------------------------------------------------------------------ vue : participants d'un événement ------------------------------------------------------------------ */

  async function vueParticipants(id) {
    coque(h("p", { class: "muted" }, "Chargement…"));
    let evenement, participants;
    try {
      [evenement, participants] = await Promise.all([api(`/api/evenements/${id}/`), api(`/api/evenements/${id}/inscriptions/`)]);
    } catch (erreur) { return erreur.statut === 401 ? null : coque(h("div", { class: "alerte" }, phrases(erreur.donnees).join(" "))); }

    const nbPresents = participants.filter((p) => p.present).length;
    const corpsTableau = h("tbody");
    const compteur = h("span", { class: "muted" });
    const recherche = h("input", { type: "search", placeholder: "Rechercher un nom, une filiale, une adresse…" });
    const filtre = h("select", {}, h("option", { value: "tous" }, "Tous"), h("option", { value: "presents" }, "Présents"), h("option", { value: "absents" }, "Absents"));

    function afficherLignes() {
      const mot = recherche.value.trim().toLowerCase();
      const choisis = participants.filter((p) =>
        (filtre.value === "tous" || (filtre.value === "presents") === p.present)
        && (!mot || [p.nom, p.prenom, p.filiale, p.email, p.telephone].join(" ").toLowerCase().includes(mot)));
      compteur.textContent = `${choisis.length} sur ${participants.length}`;
      corpsTableau.replaceChildren(...(choisis.length ? choisis.map((p) => h("tr", {},
        h("td", {}, p.nom), h("td", {}, p.prenom), h("td", {}, p.filiale), h("td", {}, p.email), h("td", {}, p.telephone),
        h("td", {}, p.creneau || "—"),
        h("td", {}, h("span", { class: "badge " + (p.present ? "oui" : "non") }, p.present ? "Présent" : "Absent"))))
        : [h("tr", {}, h("td", { colspan: 7, class: "vide" }, participants.length ? "Aucun résultat." : "Personne ne s'est encore inscrit."))]));
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
    const boutonEnvoi = h("button", { class: "btn", type: "button", disabled: diffusion.length === 0 || !evenement.inscriptions_ouvertes, onclick: async () => {
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
        ? "Cet événement est terminé : le lien d'inscription a expiré."
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
        h("div", { class: "stat" }, h("strong", {}, String(participants.length)), h("span", {}, "Inscrits")),
        h("div", { class: "stat" }, h("strong", {}, String(nbPresents)), h("span", {}, "Présents")),
        h("div", { class: "stat" }, h("strong", {}, String(participants.length - nbPresents)), h("span", {}, "Absents"))),
      h("div", { class: "carte" }, h("h2", {}, "Lien d'inscription"),
        evenement.inscriptions_ouvertes ? null : h("div", { class: "alerte" }, "Ce lien a expiré : l'événement est terminé, plus personne ne peut s'inscrire."),
        h("div", { class: "lien-inscription" }, h("code", {}, evenement.url_inscription), h("button", { class: "btn btn-clair btn-petit", type: "button", onclick: copier }, "Copier"))),
      h("div", { class: "carte" }, h("h2", {}, "Participants"),
        h("div", { class: "outils" }, recherche, filtre, compteur),
        h("div", { class: "tableau-conteneur" }, h("table", {},
          h("thead", {}, h("tr", {}, ["Nom", "Prénom", "Filiale", "Adresse e-mail", "Téléphone", "Créneau", "Présence"].map((t) => h("th", {}, t)))),
          corpsTableau))),
      sectionEnvoi);
    afficherLignes();
  }

  /* ------------------------------------------------------------------ routeur : une « page » par adresse après le # ------------------------------------------------------------------ */

  function routeur() {
    const adresse = location.hash.replace(/^#/, "") || "/";
    if (!sessionStorage.getItem("jeton")) return vueConnexion();
    let m;
    if (adresse === "/") return vueEvenements();
    if (adresse === "/lieux") return vueLieux();
    if (adresse === "/evenement/nouveau") return vueFormulaire(null);
    if ((m = adresse.match(/^\/evenement\/(\d+)\/modifier$/))) return vueFormulaire(Number(m[1]));
    if ((m = adresse.match(/^\/evenement\/(\d+)\/participants$/))) return vueParticipants(Number(m[1]));
    location.hash = "#/";
  }
  window.addEventListener("hashchange", routeur);
  routeur();
})();
