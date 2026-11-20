from django.contrib import admin
from django.http import HttpResponse
from django.urls import path, re_path

from evenements.views import admin_site, api, auth, site

handler404 = 'evenements.security.handler404'
handler500 = 'evenements.security.handler500'

urlpatterns = [
    # PWA
    path('manifest.webmanifest', site.manifest),
    path('.well-known/assetlinks.json', site.assetlinks),
    path('sw.js', site.service_worker),

    # Comptes
    path('connexion', auth.connexion),
    path('inscription', auth.inscription),
    path('inscription/code', auth.inscription_code),
    path('inscription/code/renvoyer', auth.inscription_renvoyer),
    path('auth/google', auth.google_start),
    path('auth/google/callback', auth.google_callback),
    path('deconnexion', auth.deconnexion),
    path('confidentialite', auth.confidentialite),
    path('conditions', auth.conditions),

    # Employés
    path('', site.home),
    path('evenements/<int:event_id>', site.event_detail),
    path('evenements/<int:event_id>/photo', site.event_photo),
    path('evenements/<int:event_id>/participer', site.participer),
    path('evenements/<int:event_id>/annuler', site.annuler),
    path('evenements/<int:event_id>/agenda.ics', site.agenda_ics),
    path('evenements/<int:event_id>/qr.png', site.qr_image),
    path('scan', site.scan_page),

    # Administrateur
    path('admin/evenements/nouveau', admin_site.event_new),
    path('admin/evenements', admin_site.event_create),
    path('admin/evenements/<int:event_id>/modifier', admin_site.event_edit),
    path('admin/evenements/<int:event_id>/rapport.pdf', admin_site.report_pdf),
    path('admin/evenements/<int:event_id>/export.xlsx', admin_site.export_xlsx),
    path('admin/evenements/<int:event_id>/terminer', admin_site.event_finish),
    path('admin/tableau-de-bord', admin_site.dashboard),
    path('admin/agents', admin_site.accounts),
    path('admin/agents/<int:user_id>', admin_site.account_agent),
    path('admin/comptes/<int:user_id>/supprimer', admin_site.account_delete),
    path('admin/test-email', admin_site.test_email),
    path('django-admin/', admin.site.urls),

    # Application mobile
    path('api/v1/config', api.config),
    path('api/v1/auth/login', api.login),
    path('api/v1/auth/logout', api.logout),
    path('api/v1/me', api.me),
    path('api/v1/auth/signup', api.signup),
    path('api/v1/auth/signup/verify', api.signup_verify),
    path('api/v1/auth/signup/resend', api.signup_resend),
    path('api/v1/events', api.events),
    path('api/v1/events/<int:event_id>', api.event_get),
    path('api/v1/events/<int:event_id>/photo', api.event_photo),
    path('api/v1/events/<int:event_id>/participer', api.participer),
    path('api/v1/events/<int:event_id>/annuler', api.annuler),
    path('api/v1/scan', api.scan),
]
