"""Protections communes : en-têtes de sécurité, limitation des tentatives, contrôles d'accès, réponses JSON de l'API."""
import functools
import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render

logger = logging.getLogger(__name__)

CSP = "; ".join([
    "default-src 'self'", "base-uri 'self'", "font-src 'self' https: data:", "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'self'", "img-src 'self' data:", "object-src 'none'", "script-src 'self'", "script-src-attr 'none'",
    "style-src 'self' https: 'unsafe-inline'", "connect-src 'self'",
])


class HeadersMiddleware:
    """En-têtes de sécurité, et aucune page gardée en mémoire par le navigateur : après une déconnexion,
    « Retour » ne peut plus afficher les listes ni les informations personnelles."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.headers.setdefault('Content-Security-Policy', CSP)
        response.headers.setdefault('Cache-Control', 'no-store')
        return response


class ApiMiddleware:
    """Interface mobile (/api/) : jamais de page HTML, et pas de contrôle CSRF (pas de cookie, jeton « Bearer »)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/api/'):
            request._dont_enforce_csrf_checks = True
        return self.get_response(request)

    def process_exception(self, request, exception):
        if request.path.startswith('/api/'):
            logger.exception('Erreur sur %s', request.path)
            return JsonResponse({'ok': False, 'message': 'Une erreur est survenue. Réessayez dans un instant.'}, status=500)
        return None


def client_ip(request):
    # Derrière le proxy de Render, la dernière adresse de X-Forwarded-For est celle ajoutée par le proxy lui-même.
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return forwarded.split(',')[-1].strip() if forwarded else request.META.get('REMOTE_ADDR', '')


def too_many(request, scope):
    """Compte une tentative ; True si l'adresse IP a dépassé la limite sur 15 minutes."""
    window = 15 * 60
    key = f'rl:{scope}:{client_ip(request)}:{int(time.time() // window)}'
    cache.add(key, 0, window)
    return cache.incr(key) > settings.LOGIN_RATE_LIMIT


def rate_limited(scope, api=False):
    def decorator(view):
        @functools.wraps(view)
        def wrapper(request, *args, **kwargs):
            if request.method == 'POST' and too_many(request, scope):
                message = 'Trop de tentatives. Réessayez dans quelques minutes.'
                if api:
                    return JsonResponse({'ok': False, 'message': message}, status=429)
                return render(request, 'error.html', {'title': 'Trop de tentatives', 'message': message}, status=429)
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


def wants_json(request):
    return 'application/json' in request.headers.get('Accept', '') and 'text/html' not in request.headers.get('Accept', '')


def deny(request, message):
    if wants_json(request):
        return JsonResponse({'ok': False, 'message': message}, status=403)
    return render(request, 'error.html', {'title': 'Accès refusé', 'message': message}, status=403)


def login_required(view):
    """Sans compte, on ne « rentre pas dans la maison » : retour au formulaire."""
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        if request.user.is_authenticated:
            return view(request, *args, **kwargs)
        if request.method == 'GET':
            request.session['return_to'] = request.get_full_path()
        return redirect('/connexion')
    return wrapper


def admin_required(view):
    """Droits réservés au propriétaire du site (adresses définies dans ADMIN_EMAILS)."""
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('/connexion')
        if request.user.is_admin:
            return view(request, *args, **kwargs)
        return deny(request, 'Cette page est réservée à l’administrateur.')
    return wrapper


def agent_required(view):
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('/connexion')
        if request.user.can_scan:
            return view(request, *args, **kwargs)
        return deny(request, 'Cette page est réservée aux agents d’accueil.')
    return wrapper


def not_found(request, message='Cet événement n’existe pas.'):
    return render(request, 'error.html', {'title': 'Introuvable', 'message': message}, status=404)


def handler404(request, exception=None):
    if request.path.startswith('/api/'):
        return JsonResponse({'ok': False, 'message': 'Adresse inconnue.'}, status=404)
    return render(request, 'error.html', {'title': 'Page introuvable', 'message': 'Cette page n’existe pas.'}, status=404)


def handler500(request):
    if request.path.startswith('/api/'):
        return JsonResponse({'ok': False, 'message': 'Une erreur est survenue. Réessayez dans un instant.'}, status=500)
    response = render(request, 'error.html', {'title': 'Erreur', 'message': 'Une erreur est survenue. Réessayez dans un instant.'}, status=500)
    return response


def handler403_csrf(request, reason=''):
    if request.path.startswith('/api/'):
        return JsonResponse({'ok': False, 'message': 'Requête refusée.'}, status=403)
    return HttpResponse('Formulaire expiré ou invalide. Rechargez la page et recommencez.', status=403, content_type='text/plain; charset=utf-8')
