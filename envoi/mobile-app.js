/*
  Application MOBILE : le scan des QR codes par les agents.
  Elle parle au BACKEND (l'API Django) : connexion par jeton, puis chaque QR code lu est envoyé à /api/scan/.
  Le lecteur du Zebra « tape » le code dans un champ caché : la page l'envoie dès qu'il est complet.
  Vert + deux notes montantes : présence validée. Orange : déjà scanné. Rouge : code inconnu.
*/
(() => {
  const API = `${location.protocol}//${location.hostname}:8000`;
  const racine = document.getElementById("app");

  const ASPECTS = {
    present: { classe: "ok", icone: "✔", titre: "Présence validée" },
    deja: { classe: "deja", icone: "!", titre: "Déjà scanné" },
    inconnu: { classe: "inconnu", icone: "✖", titre: "Inconnu" },
  };

  /* Fabrique un élément HTML (le texte est toujours inséré comme TEXTE, jamais comme HTML). */
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

  /* ------------------------------------------------------------------ le son ------------------------------------------------------------------ */
  /* Chrome bloque le son tant que la personne n'a pas touché l'écran : on le débloque à la connexion et au premier toucher. */

  let audio = null;
  let indicateurSon = null;

  function debloquerSon() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (erreur) { /* pas de son possible : tant pis */ }
    if (indicateurSon && audio && audio.state !== "suspended") indicateurSon.textContent = "Son activé";
  }

  /* Deux notes montantes si la présence est validée, deux sons graves sinon. Le téléphone vibre aussi. */
  function bip(ok) {
    debloquerSon();
    if (navigator.vibrate) navigator.vibrate(ok ? 150 : [120, 80, 120]);
    if (!audio) return;
    const notes = ok ? [[880, 0, 0.14], [1320, 0.16, 0.22]] : [[200, 0, 0.22], [200, 0.3, 0.22]];
    for (const [frequence, retard, duree] of notes) {
      const oscillateur = audio.createOscillator();
      const volume = audio.createGain();
      oscillateur.type = "square";
      oscillateur.frequency.value = frequence;
      volume.gain.value = 0.35;
      oscillateur.connect(volume).connect(audio.destination);
      oscillateur.start(audio.currentTime + retard);
      oscillateur.stop(audio.currentTime + retard + duree);
    }
  }

  /* ------------------------------------------------------------------ dialogue avec l'API ------------------------------------------------------------------ */

  async function api(chemin, { methode = "GET", corps } = {}) {
    const entetes = {};
    if (corps !== undefined) entetes["Content-Type"] = "application/json";
    const jeton = localStorage.getItem("jeton_scan");
    if (jeton) entetes.Authorization = `Token ${jeton}`;
    let reponse;
    try {
      reponse = await fetch(API + chemin, { method: methode, headers: entetes, body: corps !== undefined ? JSON.stringify(corps) : undefined });
    } catch (erreur) {
      throw { statut: 0, donnees: { detail: "Connexion impossible. Vérifiez le réseau." } };
    }
    let donnees = null;
    try { donnees = await reponse.json(); } catch (erreur) { /* pas de contenu */ }
    if (reponse.status === 401 && jeton) {
      localStorage.removeItem("jeton_scan");
      vueConnexion("Session expirée : reconnectez-vous.");
      throw { statut: 401, donnees };
    }
    if (!reponse.ok && reponse.status !== 404 && reponse.status !== 409) throw { statut: reponse.status, donnees };
    return { statut: reponse.status, donnees };
  }

  /* ------------------------------------------------------------------ vue : connexion ------------------------------------------------------------------ */

  let scanActif = false;
  let nettoyerScan = () => {};          /* retire les écouteurs de l'écran de scan quand on le quitte */

  function enteteApp() {
    return h("header", { class: "entete" },
      h("span", { class: "logo" }, h("img", { src: "logo.png", alt: "SNEDAI" })),
      h("div", { class: "droite" }, h("span", {}, localStorage.getItem("nom_scan") || ""),
        h("button", { class: "lien-bouton", type: "button", onclick: deconnecter }, "Déconnexion")));
  }

  /* Supprime le jeton (sur le serveur et ici) sans changer d'écran. */
  async function viderSession() {
    try { await api("/api/auth/deconnexion/", { methode: "POST" }); } catch (erreur) { /* le jeton local est supprimé de toute façon */ }
    localStorage.removeItem("jeton_scan");
    localStorage.removeItem("nom_scan");
  }

  async function deconnecter() {
    await viderSession();
    vueConnexion();
  }

  function vueConnexion(message) {
    scanActif = false;
    nettoyerScan();
    const zoneErreur = h("div", { class: "alerte", hidden: !message }, message || "");
    const bouton = h("button", { class: "btn", type: "submit" }, "Se connecter");
    const formulaire = h("form", { onsubmit: async (evenement) => {
      evenement.preventDefault();
      debloquerSon();
      zoneErreur.hidden = true;
      bouton.disabled = true;
      try {
        const reponse = await api("/api/auth/token/", { methode: "POST", corps: { username: formulaire.username.value.trim(), password: formulaire.password.value } });
        localStorage.setItem("jeton_scan", reponse.donnees.token);
        const moi = (await api("/api/auth/moi/")).donnees;
        if (moi.role !== "agent" && moi.role !== "administrateur") {
          await viderSession();
          throw { donnees: { detail: "Ce compte n'a pas le droit de scanner." } };
        }
        localStorage.setItem("nom_scan", moi.username);
        vueScan();
      } catch (erreur) {
        zoneErreur.textContent = erreur.statut === 400 ? "Identifiant ou mot de passe incorrect." : ((erreur.donnees && erreur.donnees.detail) || "Une erreur est survenue.");
        zoneErreur.hidden = false;
      } finally {
        bouton.disabled = false;
      }
    } },
      h("div", { class: "champ" }, h("label", { for: "username" }, "Identifiant"),
        h("input", { id: "username", name: "username", required: true, autocomplete: "username", autocapitalize: "none", autocorrect: "off", spellcheck: "false" })),
      h("div", { class: "champ" }, h("label", { for: "password" }, "Mot de passe"),
        h("input", { id: "password", name: "password", type: "password", required: true, autocomplete: "current-password" })),
      bouton);
    racine.replaceChildren(h("main", { class: "contenu connexion" },
      h("div", { class: "marque-centre" }, h("span", { class: "logo grand" }, h("img", { src: "logo.png", alt: "SNEDAI" }))),
      h("div", { class: "carte" }, h("h1", { style: "margin-top:0" }, "Scan des présences"), zoneErreur, formulaire)));
  }

  /* ------------------------------------------------------------------ vue : scan ------------------------------------------------------------------ */

  function vueScan() {
    nettoyerScan();
    scanActif = true;
    let occupe = false;
    let dernierCode = "";
    let dernierMoment = 0;
    let retourAttente = null;

    const saisie = h("input", { id: "saisie-lecteur", autocomplete: "off", autocapitalize: "off", "aria-label": "Code scanné" });
    const formulaireLecteur = h("form", { autocomplete: "off" }, saisie);
    const icone = h("div", { class: "icone" }, "◯");
    const titre = h("div", { class: "titre" }, "Prêt à scanner");
    const detail = h("p", { class: "detail" });
    const etat = h("div", { class: "etat attente", role: "status" }, icone, titre, detail);
    indicateurSon = h("p", { class: "son" }, audio && audio.state !== "suspended" ? "Son activé" : "Touchez l'écran une fois pour activer le son");
    const historique = h("ul", { class: "historique" });

    function afficher(statut, personne, message) {
      const aspect = ASPECTS[statut] || ASPECTS.inconnu;
      etat.className = "etat " + aspect.classe;
      icone.textContent = aspect.icone;
      titre.textContent = aspect.titre;
      const nom = personne ? `${personne.prenom} ${personne.nom}` : "";
      let texte = personne ? `${nom} · ${personne.filiale}\n${personne.evenement}` : (statut === "inconnu" ? "QR code non reconnu" : "");
      if (statut === "deja" && message) texte += `\n${message}`;
      detail.textContent = texte;
      bip(statut === "present");
      historique.prepend(h("li", { class: aspect.classe }, `${new Date().toLocaleTimeString("fr-FR")} · ${nom || "Inconnu"} · ${aspect.titre}`));
      while (historique.children.length > 8) historique.lastChild.remove();
      clearTimeout(retourAttente);
      retourAttente = setTimeout(() => {
        etat.className = "etat attente";
        titre.textContent = "Prêt à scanner";
        detail.textContent = "";
      }, 4000);
    }

    /* Met le curseur dans le champ caché sans faire apparaître le clavier à l'écran. */
    function focaliser() {
      if (!scanActif) return;
      saisie.readOnly = true;
      saisie.focus();
      setTimeout(() => { saisie.readOnly = false; }, 60);
    }

    async function envoyer(code) {
      code = code.trim();
      if (!code || occupe || (code === dernierCode && Date.now() - dernierMoment < 3000)) return;
      occupe = true;
      dernierCode = code;
      dernierMoment = Date.now();
      try {
        const reponse = await api("/api/scan/", { methode: "POST", corps: { code } });
        if (reponse.statut === 403) {
          afficher("inconnu", null, "");
          detail.textContent = "Accès refusé";
        } else {
          afficher(reponse.donnees.statut, reponse.donnees.personne, reponse.donnees.message);
        }
      } catch (erreur) {
        if (erreur.statut !== 401) {
          afficher("inconnu", null, "");
          detail.textContent = (erreur.donnees && erreur.donnees.detail) || "Erreur";
        }
      } finally {
        occupe = false;
        saisie.value = "";
        focaliser();
      }
    }

    /* Le lecteur tape le code puis la touche Entrée : le formulaire est envoyé. */
    formulaireLecteur.addEventListener("submit", (evenement) => { evenement.preventDefault(); envoyer(saisie.value); });

    /* Certains lecteurs n'envoient pas Entrée : on envoie le code dès que le texte a fini de s'écrire. */
    let minuteur = null;
    saisie.addEventListener("input", () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => { if (saisie.value.trim().length >= 32) envoyer(saisie.value); }, 400);
    });

    /* Plan B : si le texte n'arrive pas dans le champ, on assemble les touches reçues par la page. */
    let tampon = "";
    let attente = null;
    function envoyerTampon() {
      const texte = tampon;
      tampon = "";
      if (texte.length >= 20) { saisie.value = texte; formulaireLecteur.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
    }
    const surTouche = (evenement) => {
      if (!scanActif) return;
      debloquerSon();
      if (evenement.key === "Enter") { clearTimeout(attente); envoyerTampon(); }
      else if (evenement.key.length === 1 && !evenement.ctrlKey && !evenement.altKey && !evenement.metaKey) {
        tampon += evenement.key;
        clearTimeout(attente);
        attente = setTimeout(envoyerTampon, 500);
      }
    };
    document.addEventListener("keydown", surTouche, true);

    racine.replaceChildren(enteteApp(), h("main", { class: "contenu" },
      formulaireLecteur, etat, indicateurSon, historique));

    const surClic = (evenement) => {
      if (!scanActif) return;
      debloquerSon();
      if (!evenement.target.closest("button, a, input")) focaliser();
    };
    document.addEventListener("click", surClic);
    nettoyerScan = () => {
      document.removeEventListener("keydown", surTouche, true);
      document.removeEventListener("click", surClic);
      clearTimeout(retourAttente);
      clearTimeout(minuteur);
      clearTimeout(attente);
    };
    saisie.addEventListener("blur", () => setTimeout(focaliser, 150));
    focaliser();
  }

  /* ------------------------------------------------------------------ démarrage ------------------------------------------------------------------ */

  /* Au démarrage : on vérifie que le jeton enregistré est encore valable. S'il est périmé, retour à la connexion
     (api() s'en charge). S'il n'y a pas de réseau, on ouvre quand même l'écran de scan. */
  async function demarrer() {
    if (!localStorage.getItem("jeton_scan")) return vueConnexion();
    try {
      await api("/api/auth/moi/");
      vueScan();
    } catch (erreur) {
      if (erreur.statut !== 401) vueScan();
    }
  }
  demarrer();
  document.addEventListener("touchstart", debloquerSon, { passive: true });
})();
