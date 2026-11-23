/*
  Application WEB : gestion des événements par l'administrateur.
  Elle parle au BACKEND (l'API Django) : connexion par jeton, création / lecture / modification / suppression
  des événements, liste des participations, export Excel et envoi du lien par e-mail à tous les employés.
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

  /* Une date renvoyée par l'API (« 2026-12-08T12:00:00Z ») devient la valeur d'un champ date + heure du navigateur. */
  function versChampLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const deux = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
  }

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

  const ICONE_OEIL = (() => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
    svg.innerHTML = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>';
    return svg;
  })();

  function coque(...contenu) {
    const entete = h("header", { class: "entete" },
      h("a", { class: "marque", href: "#/" }, h("span", { class: "logo" }, h("img", { src: "logo.png", alt: "SNEDAI" }))),
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
      h("td", {}, h("strong", {}, e.nom), e.inscriptions_ouvertes ? null : h("span", { class: "badge non", style: "margin-left:.5rem" }, "Inscriptions closes")),
      h("td", {}, formaterDate(e.date)),
      h("td", {}, e.lieu),
      h("td", {}, e.places ? `${e.nombre_inscrits} / ${e.places}` : String(e.nombre_inscrits),
        e.complet ? h("span", { class: "badge non", style: "margin-left:.5rem" }, "Complet") : null),
      h("td", {}, String(e.nombre_presents)),
      h("td", {}, h("div", { class: "actions" },
        h("a", { class: "btn btn-clair btn-petit btn-icone", href: `#/evenement/${e.id}/participations`, title: "Voir les participations", "aria-label": "Voir les participations" }, ICONE_OEIL),
        h("a", { class: "btn btn-clair btn-petit", href: `#/evenement/${e.id}/modifier` }, "Modifier"),
        h("button", { class: "btn btn-danger btn-petit", type: "button", onclick: () => supprimer(e) }, "Supprimer")))));

    coque(
      h("div", { class: "barre" }, h("div", {}, h("h1", {}, "Événements"), h("span", { class: "muted" }, `${evenements.length} événement(s)`)),
        evenements.length ? h("a", { class: "btn", href: "#/evenement/nouveau" }, "Nouvel événement") : null),
      h("div", { class: "carte" }, evenements.length === 0
        ? h("div", { class: "vide-centre" }, h("a", { class: "btn btn-grand", href: "#/evenement/nouveau" }, h("span", { class: "plus" }, "+"), "Nouvel événement"))
        : h("div", { class: "tableau-conteneur" }, h("table", {},
          h("thead", {}, h("tr", {}, ["Événement", "Date", "Lieu", "Inscrits", "Présents", "Actions"].map((t) => h("th", {}, t)))),
          h("tbody", {}, lignes)))));
  }

  /* Un champ de texte mis en forme, comme dans Word : on sélectionne, puis Gras, Souligné, couleur ou lien. Rend { element, html() }. */
  function editeur(valeur, indication) {
    const zone = h("div", { class: "editeur-zone", contenteditable: "true", "data-indication": indication });
    zone.innerHTML = valeur || "";
    const commande = (nom, argument) => { zone.focus(); document.execCommand("styleWithCSS", false, true); document.execCommand(nom, false, argument); };
    const bouton = (contenu, titre, action, classe = "") => h("button", { class: "outil " + classe, type: "button", title: titre, "aria-label": titre,
      onmousedown: (e) => e.preventDefault(), onclick: action }, contenu);
    const couleur = h("input", { type: "color", value: "#c00000", title: "Couleur du texte", "aria-label": "Couleur du texte", class: "outil-couleur",
      onmousedown: (e) => e.stopPropagation(), oninput: () => commande("foreColor", couleur.value) });
    const barre = h("div", { class: "editeur-barre" },
      bouton("G", "Gras", () => commande("bold"), "gras"),
      bouton("S", "Souligné", () => commande("underline"), "souligne"),
      h("span", { class: "outil-libelle" }, "Couleur"), couleur,
      bouton("Lien", "Transformer le texte sélectionné en lien", () => {
        const adresse = prompt("Adresse du lien (https://…)", "https://");
        if (adresse && /^(https?:\/\/|mailto:)/i.test(adresse)) commande("createLink", adresse);
      }),
      bouton("Effacer la mise en forme", "Enlever la mise en forme", () => commande("removeFormat")));
    return { element: h("div", { class: "editeur" }, barre, zone), html: () => (zone.textContent.trim() || zone.querySelector("a") ? zone.innerHTML : "") };
  }

  /* ------------------------------------------------------------------ vue : créer / modifier un événement ------------------------------------------------------------------ */

  async function vueFormulaire(id) {
    coque(h("p", { class: "muted" }, "Chargement…"));
    let evenement = { nom: "", date: "", lieu: "", titre: "", sous_titre: "", accroche: "", description: "", contact: "", conclusion: "", creneaux: [], inscriptions_jusqu_au: null, places: null };
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

    /* --- Le lieu : une liste de sites ; on peut aussi taper un nouveau site, il est alors enregistré dans la liste --- */
    const choixLieu = h("input", { id: "lieu", name: "lieu", list: "liste-lieux", required: true, autocomplete: "off", placeholder: "Choisir un lieu ou écrire un nouveau…", value: evenement.lieu });
    const listeLieux = h("datalist", { id: "liste-lieux" }, ...lieux.map((lieu) => h("option", { value: lieu.nom })));

    /* --- Les créneaux : un sélecteur d'heure pour le début et pour la fin (4 au maximum) --- */
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

    const riches = { titre: editeur(evenement.titre, "Ex. : CONFÉRENCE DE SENSIBILISATION – SNEDAI (vide : le nom de l'événement)"),
      sous_titre: editeur(evenement.sous_titre, "Ex. : 🎗️ TUMEUR DU SEIN : PRÉVENTION ET TRAITEMENT"),
      accroche: editeur(evenement.accroche, "Ex. : La lutte contre le cancer du sein est l'affaire de tous !"),
      description: editeur(evenement.description, "Le message : contexte, organisateurs, thème…"),
      contact: editeur(evenement.contact, "Ex. : Mme … · Cheffe du Département … · e-mail · téléphone"),
      conclusion: editeur(evenement.conclusion, "Ex. : Ensemble, informons-nous, sensibilisons-nous et mobilisons-nous…") };

    const aujourdhui = new Date().toLocaleDateString("fr-CA");           /* AAAA-MM-JJ : on ne peut pas choisir un jour passé pour un nouvel événement */
    const bouton = h("button", { class: "btn", type: "submit" }, id ? "Enregistrer les modifications" : "Créer l'événement");
    const formulaire = h("form", { class: "formulaire", onsubmit: async (evenementForm) => {
      evenementForm.preventDefault();
      zoneErreur.hidden = true;
      Object.values(erreursChamps).forEach((zone) => { zone.textContent = ""; });
      const f = Object.fromEntries(new FormData(formulaire));
      bouton.disabled = true;
      try {
        const saisi = f.lieu.trim();
        let lieu = lieux.find((l) => l.nom.toLowerCase() === saisi.toLowerCase());
        if (!lieu) {                                         /* un nouveau lieu : on l'enregistre dans la liste */
          try { lieu = await api("/api/lieux/", { methode: "POST", corps: { nom: saisi } }); }
          catch (erreur) { erreursChamps.lieu.textContent = erreur.donnees && erreur.donnees.nom ? erreur.donnees.nom.join(" ") : phrases(erreur.donnees).join(" "); return; }
          lieux.push(lieu);
        }
        const corps = { nom: f.nom, date: f.date, lieu: lieu.nom,
          titre: riches.titre.html(), sous_titre: riches.sous_titre.html(), accroche: riches.accroche.html(),
          description: riches.description.html(), contact: riches.contact.html(), conclusion: riches.conclusion.html(),
          creneaux: lignes.map((l) => `${l.champDebut.value}-${l.champFin.value}`),
          inscriptions_jusqu_au: evenement.inscriptions_jusqu_au, places: evenement.places };
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
        champ("creneaux", "Horaires", h("div", {}, listeCreneaux, boutonAjoutCreneau))),
      champ("lieu", "Lieu", h("div", {}, choixLieu, listeLieux)),
      h("h2", { class: "sous-titre" }, "Message envoyé par e-mail"),
      champ("titre", "Titre", riches.titre.element),
      champ("sous_titre", "Thème", riches.sous_titre.element),
      champ("accroche", "Phrase d'accroche", riches.accroche.element),
      champ("description", "Message", riches.description.element),
      champ("contact", "Contact", riches.contact.element),
      champ("conclusion", "Phrase de fin", riches.conclusion.element),
      h("div", { class: "actions" }, bouton, h("a", { class: "btn btn-clair", href: "#/" }, "Annuler")));

    coque(h("div", { class: "barre" }, h("h1", {}, id ? "Modifier l'événement" : "Nouvel événement")),
      h("div", { class: "carte" }, zoneErreur, formulaire));
  }

  /* ------------------------------------------------------------------ vue : participations d'un événement ------------------------------------------------------------------ */

  async function vueParticipations(id) {
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

    const sectionEnvoi = h("div", { class: "envoi-centre" }, boutonEnvoi);

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

  /* ------------------------------------------------------------------ routeur : une « page » par adresse après le # ------------------------------------------------------------------ */

  function routeur() {
    const adresse = location.hash.replace(/^#/, "") || "/";
    if (!sessionStorage.getItem("jeton")) return vueConnexion();
    let m;
    if (adresse === "/") return vueEvenements();
    if (adresse === "/evenement/nouveau") return vueFormulaire(null);
    if ((m = adresse.match(/^\/evenement\/(\d+)\/modifier$/))) return vueFormulaire(Number(m[1]));
    if ((m = adresse.match(/^\/evenement\/(\d+)\/participations$/))) return vueParticipations(Number(m[1]));
    location.hash = "#/";
  }
  window.addEventListener("hashchange", routeur);
  routeur();
})();
