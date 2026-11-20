"""
La liste des ADRESSES (URL) du site.

Quand le navigateur demande une adresse, Django parcourt cette liste de haut en bas
et appelle la vue du premier chemin qui correspond.
"""
from django.contrib import admin
from django.urls import path

from evenements.views import admin_site, auth, public, site

urlpatterns = [
    path('', site.accueil),

    # Connexion (administrateur et agents)
    path('connexion', auth.connexion),
    path('deconnexion', auth.deconnexion),

    # PUBLIC : le lien d'inscription d'un événement, et le billet de l'inscrit
    path('e/<str:lien>', public.page_inscription),
    path('billet/<str:jeton>', public.page_billet),
    path('billet/<str:jeton>/qr.png', public.telecharger_billet),

    # Scan des QR codes (agents et administrateur)
    path('scan', site.scanner),

    # BACKOFFICE (administrateur) : le CRUD des événements
    path('admin/evenements', admin_site.liste_evenements),                                  # Read : la liste
    path('admin/evenements/nouveau', admin_site.nouvel_evenement),                          # Create : le formulaire
    path('admin/evenements/creer', admin_site.creer_evenement),                             # Create : l'enregistrement
    path('admin/evenements/<int:event_id>', admin_site.detail_evenement),                   # Read : un événement et ses inscriptions
    path('admin/evenements/<int:event_id>/modifier', admin_site.modifier_evenement),        # Update
    path('admin/evenements/<int:event_id>/supprimer', admin_site.supprimer_evenement),      # Delete
    path('admin/evenements/<int:event_id>/export.xlsx', admin_site.export_excel),           # Export Excel
    path('admin/evenements/<int:event_id>/inscriptions/<int:inscription_id>/supprimer', admin_site.supprimer_inscription),

    # BACKOFFICE : les agents de scan
    path('admin/agents', admin_site.agents),
    path('admin/agents/<int:user_id>/supprimer', admin_site.supprimer_agent),
    path('admin/test-email', admin_site.tester_email),

    # Interface d'administration fournie par Django
    path('django-admin/', admin.site.urls),
]
