"""Déclare les tables dans l'interface d'administration de Django (/django-admin/)."""
from django.contrib import admin

from .models import Event, Inscription, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('nom', 'prenom', 'email', 'is_agent', 'created_at')
    exclude = ('password', 'last_login')


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('titre', 'debut', 'lieu')


@admin.register(Inscription)
class InscriptionAdmin(admin.ModelAdmin):
    list_display = ('nom', 'prenom', 'filiale', 'telephone', 'email', 'event', 'creneau', 'present')
    list_filter = ('event', 'present', 'filiale')
    search_fields = ('nom', 'prenom', 'email', 'telephone')
    readonly_fields = ('qr_token',)
