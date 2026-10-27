import re

EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def password_error(password):
    """Mot de passe du site : 8 caractères minimum, avec au moins une lettre et un chiffre."""
    if len(password) < 8 or not re.search(r'[A-Za-zÀ-ÿ]', password) or not re.search(r'\d', password):
        return 'Le mot de passe doit contenir au moins 8 caractères, dont au moins une lettre et un chiffre.'
    return None


def signup_error(values, password, confirmation, filiales=()):
    """Vérifications d'une inscription, communes au site et à l'application. Renvoie un message ou None."""
    if not values['nom'] or not values['prenom'] or not values['filiale']:
        return 'Merci de remplir le nom, le prénom et la filiale.'
    if filiales and values['filiale'] not in filiales:
        return 'Choisissez une filiale dans la liste.'
    if not EMAIL_RE.match(values['email']):
        return 'Adresse e-mail invalide.'
    weak = password_error(password)
    if weak:
        return weak
    if password != confirmation:
        return 'Les deux mots de passe ne sont pas identiques.'
    return None


def clean(value, maximum=100):
    return str(value if value is not None else '').strip()[:maximum]
