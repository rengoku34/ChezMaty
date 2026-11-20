"""
Protections communes à tout le site :
  - limiter les tentatives de connexion (contre les pirates),
  - réserver des pages aux personnes connectées, aux agents ou à l'administrateur.
"""
import functools
import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.shortcuts import redirect, render


# ---------------------------------------------------------------------------
# 1. Limiter les tentatives (contre les pirates)
# ---------------------------------------------------------------------------
def client_ip(request):
    """Adresse IP du visiteur. Derrière le proxy de Render, la dernière adresse de X-Forwarded-For
    est celle ajoutée par le proxy lui-même (les précédentes peuvent être falsifiées par le visiteur)."""
    transmise = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return transmise.split(',')[-1].strip() if transmise else request.META.get('REMOTE_ADDR', '')


def trop_de_tentatives(request, categorie):
    """Compte une tentative. Renvoie True si cette adresse IP a dépassé la limite sur 15 minutes."""
    fenetre = 15 * 60                                         # 15 minutes, en secondes
    cle = f'rl:{categorie}:{client_ip(request)}:{int(time.time() // fenetre)}'
    cache.add(cle, 0, fenetre)                                # crée le compteur s'il n'existe pas
    return cache.incr(cle) > settings.LOGIN_RATE_LIMIT        # +1, puis compare à la limite


def rate_limited(categorie):
    """Décorateur : bloque la vue (erreur 429) si trop de formulaires ont été envoyés depuis cette adresse IP.

    Un « décorateur » est une fonction qui enveloppe une autre fonction pour lui ajouter un comportement.
    On l'utilise en écrivant @rate_limited('login') juste au-dessus de la vue.
    """
    def decorateur(vue):
        @functools.wraps(vue)
        def enveloppe(request, *args, **kwargs):
            if request.method == 'POST' and trop_de_tentatives(request, categorie):
                return render(request, 'error.html', {
                    'title': 'Trop de tentatives',
                    'message': 'Trop de tentatives. Réessayez dans quelques minutes.',
                }, status=429)
            return vue(request, *args, **kwargs)
        return enveloppe
    return decorateur


# ---------------------------------------------------------------------------
# 2. Réponses d'erreur
# ---------------------------------------------------------------------------
def veut_du_json(request):
    """Vrai si l'appelant attend du JSON (application mobile, JavaScript) plutôt qu'une page HTML."""
    accept = request.headers.get('Accept', '')
    return 'application/json' in accept and 'text/html' not in accept


def refuser(request, message):
    """Réponse « accès refusé » (erreur 403) : une page HTML, ou du JSON selon l'appelant."""
    if veut_du_json(request):
        return JsonResponse({'ok': False, 'message': message}, status=403)
    return render(request, 'error.html', {'title': 'Accès refusé', 'message': message}, status=403)


def not_found(request, message='Cet événement n’existe pas.'):
    """Page « introuvable » (erreur 404)."""
    return render(request, 'error.html', {'title': 'Introuvable', 'message': message}, status=404)


# ---------------------------------------------------------------------------
# 3. Réserver des pages selon le rôle
# ---------------------------------------------------------------------------
def login_required(vue):
    """Décorateur : sans compte connecté, on renvoie vers le formulaire de connexion.
    (Les événements sont privés : « on ne rentre pas dans la maison » sans compte.)"""
    @functools.wraps(vue)
    def enveloppe(request, *args, **kwargs):
        if request.user.is_authenticated:
            return vue(request, *args, **kwargs)
        if request.method == 'GET':
            request.session['return_to'] = request.get_full_path()   # pour revenir ici après la connexion
        return redirect('/connexion')
    return enveloppe


def admin_required(vue):
    """Décorateur : réservé à l'administrateur (adresse dans ADMIN_EMAILS).
    Sans compte -> page de connexion ; avec un compte qui n'est pas administrateur -> « Accès refusé » (403)."""
    @functools.wraps(vue)
    def enveloppe(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('/connexion')
        if request.user.is_admin:
            return vue(request, *args, **kwargs)
        return refuser(request, 'Cette page est réservée à l’administrateur.')
    return enveloppe


def agent_required(vue):
    """Décorateur : réservé aux agents de scan (et à l'administrateur)."""
    @functools.wraps(vue)
    def enveloppe(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('/connexion')
        if request.user.can_scan:
            return vue(request, *args, **kwargs)
        return refuser(request, 'Cette page est réservée aux agents d’accueil.')
    return enveloppe
