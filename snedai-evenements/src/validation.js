const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mot de passe du site : 8 caractères minimum, avec au moins une lettre et un chiffre.
function passwordError(password) {
  if (password.length < 8 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return 'Le mot de passe doit contenir au moins 8 caractères, dont au moins une lettre et un chiffre.';
  }
  return null;
}

// Vérifications d'une inscription, communes au site et à l'application. Renvoie un message ou null.
// (Le contrôle « adresse déjà utilisée » se fait à part, dans la base.)
function signupError({ nom, prenom, filiale, email }, password, confirmation, filiales = []) {
  if (!nom || !prenom || !filiale) return 'Merci de remplir le nom, le prénom et la filiale.';
  if (filiales.length && !filiales.includes(filiale)) return 'Choisissez une filiale dans la liste.';
  if (!EMAIL_RE.test(email)) return 'Adresse e-mail invalide.';
  const weak = passwordError(password);
  if (weak) return weak;
  if (password !== confirmation) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}

module.exports = { EMAIL_RE, passwordError, signupError };
