"""
Vérifications des données saisies dans le formulaire d'inscription.
Ces fonctions sont séparées des vues pour pouvoir être réutilisées et testées.
"""
import re

# Une adresse e-mail valable ressemble à : quelquechose@domaine.extension (sans espace).
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
# Un numéro de téléphone : chiffres, espaces, points, tirets, parenthèses, « + » au début. 8 à 20 caractères.
TELEPHONE_RE = re.compile(r'^\+?[0-9 .\-()]{8,20}$')


def inscription_error(valeurs, filiales=(), creneaux=()):
    """Vérifie le formulaire d'inscription. Renvoie le premier message d'erreur trouvé, ou None."""
    if not valeurs['nom'] or not valeurs['prenom']:
        return 'Merci de remplir votre nom et votre prénom.'
    if not valeurs['filiale']:
        return 'Choisissez votre filiale.'
    if filiales and valeurs['filiale'] not in filiales:
        return 'Choisissez une filiale dans la liste.'
    if not TELEPHONE_RE.match(valeurs['telephone']) or sum(c.isdigit() for c in valeurs['telephone']) < 8:
        return 'Numéro de téléphone invalide.'
    if not EMAIL_RE.match(valeurs['email']):
        return 'Adresse e-mail invalide.'
    if creneaux and valeurs['creneau'] not in creneaux:
        return 'Choisissez un créneau horaire.'
    return None


def clean(valeur, maximum=100):
    """Nettoie un texte saisi : None devient '', espaces autour retirés, longueur limitée."""
    return str(valeur if valeur is not None else '').strip()[:maximum]
