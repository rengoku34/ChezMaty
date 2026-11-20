"""
La liste des ADRESSES (URL) du projet : ici on aiguille vers les trois parties du site.

  /api/...    l'API                       -> evenements/api/urls.py
  /e/... /billet/... /scan/...  les pages HTML -> evenements/pages/urls.py
  /admin/     le back-office Django (comptes et inscriptions)
  /           l'application web de l'administrateur (dossier web/)
  /snedai-scan.apk   le fichier d'installation de l'application mobile (dossier livrables/)
"""
import mimetypes

from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

mimetypes.add_type("text/javascript", ".js")            # les modules JavaScript de l'application web exigent ce type, même si Windows en déclare un autre

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("evenements.api.urls")),
    path("", include("evenements.pages.urls")),

    # --- La documentation automatique de l'API ---
    path("schema/", SpectacularAPIView.as_view(), name="schema"),                         # le plan de l'API (fichier technique)
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),         # Swagger : tester l'API dans le navigateur

    # --- L'application mobile : son fichier d'installation ---
    path("snedai-scan.apk", serve, {"path": "snedai-scan.apk", "document_root": settings.DOSSIER_LIVRABLES}),

    # --- L'application web : la page d'accueil, puis ses dossiers css/, js/ et img/ ---
    path("", serve, {"path": "index.html", "document_root": settings.DOSSIER_WEB}, name="accueil"),
    re_path(r"^(?P<path>(?:css|js|img)/[\w./\-]+)$", serve, {"document_root": settings.DOSSIER_WEB}),
]
