"""
Variables ajoutées automatiquement à TOUTES les pages (sans les passer une par une dans chaque vue).
Déclaré dans settings.py, section TEMPLATES > context_processors.
"""
from pathlib import Path

from django.conf import settings

# On cherche le logo de l'entreprise dans static/img/ (il suffit d'y déposer logo.png, logo.jpg…).
_logo = next((nom for nom in ('logo.svg', 'logo.png', 'logo.jpg', 'logo.webp')
              if (Path(settings.BASE_DIR) / 'static/img' / nom).exists()), None)


def site(request):
    utilisateur = request.user
    return {
        'asset_version': settings.ASSET_VERSION,
        'logo_url': f'/static/img/{_logo}?v={settings.ASSET_VERSION}' if _logo else None,
        # Ces trois-là servent à afficher ou cacher des liens dans le menu selon le rôle.
        'is_admin': bool(utilisateur.is_authenticated and utilisateur.is_admin),
        'is_agent': bool(utilisateur.is_authenticated and utilisateur.can_scan),
        'path': request.path,   # l'adresse de la page, pour surligner le lien du menu actif
    }
