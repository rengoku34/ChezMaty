/*
  Le formulaire d'inscription : il envoie les données à l'API (POST /api/public/evenements/<lien>/inscriptions/).
  Quand l'inscription est enregistrée, on QUITTE le formulaire : la page « Merci » le remplace (le bouton « retour » ne ramène pas au formulaire).
  Les erreurs, elles, s'écrivent sous les champs concernés.
*/
(() => {
  const formulaire = document.getElementById("form-inscription");
  const bouton = document.getElementById("bouton-envoyer");
  const alerte = document.getElementById("alerte");

  function effacerErreurs() {
    alerte.hidden = true;
    document.querySelectorAll(".erreur").forEach((zone) => (zone.textContent = ""));
  }

  // L'API renvoie par exemple {"email": ["Cette adresse est déjà inscrite"]} : on écrit chaque message sous son champ.
  function afficherErreurs(erreurs) {
    const autres = [];
    for (const [champ, messages] of Object.entries(erreurs)) {
      const texte = Array.isArray(messages) ? messages.join(" ") : String(messages);
      const zone = document.querySelector(`.erreur[data-champ="${champ}"]`);
      if (zone) zone.textContent = texte;
      else autres.push(texte);
    }
    if (autres.length) {
      alerte.textContent = autres.join(" ");
      alerte.hidden = false;
    }
  }

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    effacerErreurs();
    bouton.disabled = true;
    bouton.textContent = "Envoi…";
    try {
      const reponse = await fetch(formulaire.dataset.api, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formulaire))),
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (reponse.status === 201) {
        // On quitte le formulaire. (Sans service d'e-mail, on va directement au billet : c'est la seule façon de voir son QR code.)
        window.location.replace(donnees.billet || formulaire.dataset.merci);
        return;
      } else if (reponse.status === 429) {
        afficherErreurs({ detail: "Trop de demandes. Réessayez dans une minute." });
      } else if (reponse.status === 410) {
        afficherErreurs({ detail: "Les inscriptions sont closes : ce lien a expiré." });
      } else if (reponse.status === 404) {
        afficherErreurs({ detail: "Cet événement n'existe plus. Vérifiez le lien reçu." });
      } else {
        afficherErreurs(donnees);
      }
    } catch (erreur) {
      afficherErreurs({ detail: "Connexion impossible. Vérifiez le réseau et réessayez." });
    } finally {
      bouton.disabled = false;
      bouton.textContent = "Envoyer";
    }
  });
})();
