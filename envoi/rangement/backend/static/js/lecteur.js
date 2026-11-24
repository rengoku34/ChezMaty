/*
  Page de scan : le lecteur (Zebra, douchette) « tape » le texte du QR code. On l'envoie à l'API (POST /api/scan/)
  et on affiche une grande coche verte (présence validée), orange (déjà scanné) ou rouge (inconnu).
*/
(() => {
  const page = document.getElementById("scan-page");
  const formulaire = document.getElementById("scan-form");
  const saisie = document.getElementById("scan-saisie");
  const etat = document.getElementById("scan-etat");
  const icone = document.getElementById("scan-icone");
  const titre = document.getElementById("scan-titre");
  const detail = document.getElementById("scan-detail");
  const liste = document.getElementById("scan-liste");

  const ASPECTS = {
    present: { classe: "ok", icone: "✔", titre: "Présence validée" },
    deja: { classe: "deja", icone: "!", titre: "Déjà scanné" },
    inconnu: { classe: "inconnu", icone: "✖", titre: "Inconnu" },
  };

  let occupe = false;
  let dernierCode = "";
  let dernierMoment = 0;
  let retourAttente = null;

  /* Le cookie « csrftoken » prouve à Django que la demande vient bien de cette page. */
  const jetonCsrf = () => (document.cookie.split("; ").find((c) => c.startsWith("csrftoken=")) || "").split("=")[1] || "";

  /* Le son : Chrome bloque l'audio tant que la personne n'a pas touché la page une fois.
     On « débloque » donc le son au premier toucher, et on l'indique à l'écran. */
  let audio = null;
  const indicateurSon = document.getElementById("scan-son");

  function debloquerSon() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (erreur) { /* pas de son possible : tant pis */ }
    if (indicateurSon && audio && audio.state !== "suspended") {
      indicateurSon.textContent = "Son activé";
    }
  }

  /* Un son net quand c'est scanné : deux notes montantes si la présence est validée, deux sons graves sinon.
     Le téléphone vibre aussi. */
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

  /* Met le curseur dans le champ caché sans faire apparaître le clavier à l'écran. */
  function focaliser() {
    saisie.readOnly = true;
    saisie.focus();
    setTimeout(() => { saisie.readOnly = false; }, 60);
  }

  function afficher(statut, personne, message) {
    const aspect = ASPECTS[statut] || ASPECTS.inconnu;
    etat.className = "scan-etat " + aspect.classe;
    icone.textContent = aspect.icone;
    titre.textContent = aspect.titre;
    const nom = personne ? `${personne.prenom} ${personne.nom}` : "";
    detail.textContent = personne ? `${nom} · ${personne.filiale}` : (statut === "inconnu" ? "QR code non reconnu" : "");
    if (statut === "deja" && message) detail.textContent += `\n${message}`;
    bip(statut === "present");

    const ligne = document.createElement("li");
    ligne.className = aspect.classe;
    ligne.textContent = `${new Date().toLocaleTimeString("fr-FR")} · ${nom || "Inconnu"} · ${aspect.titre}`;
    liste.prepend(ligne);
    while (liste.children.length > 8) liste.lastChild.remove();

    clearTimeout(retourAttente);
    retourAttente = setTimeout(() => {
      etat.className = "scan-etat attente";
      icone.textContent = "◯";
      titre.textContent = "Prêt à scanner";
      detail.textContent = "";
    }, 4000);
  }

  async function envoyer(code) {
    code = code.trim();
    /* On ignore le même code lu plusieurs fois de suite en quelques secondes. */
    if (!code || occupe || (code === dernierCode && Date.now() - dernierMoment < 3000)) return;
    occupe = true;
    dernierCode = code;
    dernierMoment = Date.now();
    try {
      const reponse = await fetch(page.dataset.api, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": jetonCsrf() },
        body: JSON.stringify({ code }),
      });
      if (reponse.status === 401 || reponse.status === 403) {
        afficher("inconnu", null, "");
        detail.textContent = "Session expirée : reconnectez-vous";
      } else {
        const donnees = await reponse.json();
        afficher(donnees.statut, donnees.personne, donnees.message);
      }
    } catch (erreur) {
      afficher("inconnu", null, "");
      detail.textContent = "Connexion impossible";
    } finally {
      occupe = false;
      saisie.value = "";
      focaliser();
    }
  }

  /* Un lecteur « tape » le contenu du QR code, puis la touche Entrée : le formulaire est envoyé. */
  formulaire.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    envoyer(saisie.value);
  });

  /* Certains lecteurs n'envoient pas Entrée : on envoie le code dès que le texte a fini de s'écrire. */
  let minuteur = null;
  saisie.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      if (saisie.value.trim().length >= 32) envoyer(saisie.value);
    }, 400);
  });

  /* Plan B : si le texte n'arrive pas dans le champ, on assemble nous-mêmes les touches reçues par la page. */
  let tampon = "";
  let attente = null;
  function envoyerTampon() {
    const texte = tampon;
    tampon = "";
    if (texte.length >= 20) {
      saisie.value = texte;
      formulaire.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  }
  document.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") {
      clearTimeout(attente);
      envoyerTampon();
    } else if (evenement.key.length === 1 && !evenement.ctrlKey && !evenement.altKey && !evenement.metaKey) {
      tampon += evenement.key;
      clearTimeout(attente);
      attente = setTimeout(envoyerTampon, 500);
    }
  }, true);

  /* Le premier toucher débloque le son, puis le curseur revient dans le champ caché. */
  document.addEventListener("click", () => { debloquerSon(); focaliser(); });
  document.addEventListener("touchstart", debloquerSon, { passive: true });
  document.addEventListener("keydown", debloquerSon);
  saisie.addEventListener("blur", () => setTimeout(focaliser, 150));
  focaliser();
})();
