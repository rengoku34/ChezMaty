"""
L'ADMINISTRATION de Django (/admin/) : réservée à la gestion des COMPTES (agents de scan, administrateurs).
Le travail de tous les jours (événements, participants, Excel, envoi du lien) se fait dans l'application web.
On garde aussi les inscriptions, pour corriger une présence ou supprimer une inscription faite par erreur.
"""
from django import forms
from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import Group, User
from rest_framework.authtoken.models import Token, TokenProxy

from .models import Inscription
from .api.permissions import est_administrateur, est_agent

admin.site.site_header = "SNEDAI"
admin.site.site_title = "SNEDAI : administration"
admin.site.index_title = "Gestion des comptes"
admin.site.site_url = None                      # pas de lien « Voir le site » (il tournerait en rond)

# Pages cachées : inutiles au quotidien, et dangereuses (supprimer le groupe « Agents de scan » casserait le scan).
# On peut toujours mettre un compte dans un groupe depuis sa fiche.
for modele in (Group, Token, TokenProxy, User):
    try:
        admin.site.unregister(modele)
    except NotRegistered:
        pass


@admin.register(User)
class CompteAdmin(UserAdmin):
    """Les comptes : on crée un agent de scan en une seule étape (identifiant, mot de passe, groupe)."""

    list_display = ("username", "role", "is_active")
    list_filter = ("is_staff", "groups")
    filter_horizontal = ()
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Informations", {"fields": ("first_name", "last_name", "email")}),
        ("Rôle", {
            "fields": ("is_active", "is_staff", "groups"),
            "description": "Administrateur : cocher « Statut équipe ». Agent de scan : choisir le groupe « Agents de scan ».",
        }),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("username", "password1", "password2", "groups")}),)

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if db_field.name == "groups":
            kwargs["widget"] = forms.CheckboxSelectMultiple         # de simples cases à cocher
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    @admin.display(description="Rôle")
    def role(self, utilisateur):
        if est_administrateur(utilisateur):
            return "Administrateur"
        if est_agent(utilisateur):
            return "Agent de scan"
        return "Aucun droit"


@admin.register(Inscription)
class InscriptionAdmin(admin.ModelAdmin):
    """Les inscriptions : pour corriger une présence ou supprimer une inscription faite par erreur."""

    list_display = ("nom", "prenom", "filiale", "evenement", "creneau", "present")     # « present » s'affiche en icône verte/rouge
    list_filter = ("evenement", "present", "filiale")
    search_fields = ("nom", "prenom", "email")
    readonly_fields = ("qr_token", "scanne_le", "scanne_par", "cree_le")

    def has_add_permission(self, request):
        return False            # une inscription se fait par le formulaire (c'est lui qui envoie le QR code)
