from django.conf import settings
from pathlib import Path

from .services.mailer import get_mailer

_logo = next((name for name in ('logo.svg', 'logo.png', 'logo.jpg', 'logo.webp') if (Path(settings.BASE_DIR) / 'static/img' / name).exists()), None)


def site(request):
    user = request.user
    return {
        'asset_version': settings.ASSET_VERSION,
        'logo_url': f'/static/img/{_logo}?v={settings.ASSET_VERSION}' if _logo else None,
        'is_admin': bool(user.is_authenticated and user.is_admin),
        'is_agent': bool(user.is_authenticated and user.can_scan),
        'path': request.path,
    }
