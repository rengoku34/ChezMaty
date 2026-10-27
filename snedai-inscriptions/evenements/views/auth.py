"""
Les VUES de la connexion. Seuls l'administrateur et les agents se connectent :
les employés qui s'inscrivent à un événement n'ont pas de compte.
"""
from django.contrib.auth import login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods, require_POST

from ..models import User
from ..security import rate_limited
from ..services.validation import clean

# Le « backend » d'authentification de Django qui sait retrouver un utilisateur à partir de son e-mail.
BACKEND = 'django.contrib.auth.backends.ModelBackend'

# Un faux mot de passe haché. Si l'adresse saisie n'existe pas, on compare quand même avec lui :
# ainsi la réponse prend le même temps, et un pirate ne peut pas deviner quelles adresses existent.
FAUX_HASH = make_password('mot-de-passe-factice-1')


def accueil_selon_role(utilisateur):
    """Où envoyer la personne après la connexion : l'administrateur au backoffice, l'agent à la page de scan."""
    return '/admin/evenements' if utilisateur.is_admin else '/scan'


@require_http_methods(['GET', 'POST'])
@rate_limited('login')
def connexion(request):
    if request.method == 'GET':
        if request.user.is_authenticated:
            return redirect(accueil_selon_role(request.user))
        return render(request, 'connexion.html', {'title': 'Connexion'})

    # POST : la personne a envoyé le formulaire.
    email = clean(request.POST.get('email'), 200).lower()
    password = str(request.POST.get('password') or '')
    utilisateur = User.objects.par_email(email) if email else None
    # check_password compare le mot de passe saisi avec l'empreinte (hash) enregistrée.
    valide = check_password(password, utilisateur.password if utilisateur else FAUX_HASH)
    if not utilisateur or not valide or not utilisateur.can_scan:
        # Même message dans tous les cas : on ne dit pas si c'est l'adresse ou le mot de passe qui est faux.
        return render(request, 'connexion.html', {'title': 'Connexion', 'error': 'Adresse e-mail ou mot de passe incorrect.', 'email': email}, status=401)

    destination = request.session.get('return_to')
    login(request, utilisateur, backend=BACKEND)        # Django crée la session et pose le cookie
    request.session.pop('return_to', None)
    # On n'accepte qu'une adresse INTERNE au site (commence par un seul « / ») : évite les redirections piégées.
    sure = destination and destination.startswith('/') and not destination.startswith('//')
    return redirect(destination if sure else accueil_selon_role(utilisateur))


@require_POST   # la déconnexion n'est acceptée qu'en POST : un simple lien ne peut pas déconnecter quelqu'un
def deconnexion(request):
    logout(request)                                     # supprime la session
    reponse = redirect('/connexion')
    # Demande au navigateur de vider son cache : le bouton « Retour » ne réaffichera plus les pages privées.
    reponse.headers['Clear-Site-Data'] = '"cache"'
    return reponse
