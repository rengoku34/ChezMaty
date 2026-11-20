"""
Les DROITS D'ACCÈS : qui a le droit d'utiliser quelle adresse de l'API.

Trois sortes de personnes :
  - l'administrateur : un compte « staff » (créé avec createsuperuser) ;
  - l'agent de scan   : un compte membre du groupe « Agents de scan » (créé par l'administrateur) ;
  - l'employé         : aucun compte, il utilise seulement le lien d'inscription.
"""
from django.conf import settings
from rest_framework.permissions import BasePermission


def est_administrateur(utilisateur):
    return bool(utilisateur and utilisateur.is_authenticated and utilisateur.is_active and utilisateur.is_staff)


def est_agent(utilisateur):
    return bool(
        utilisateur and utilisateur.is_authenticated and utilisateur.is_active
        and utilisateur.groups.filter(name=settings.NOM_GROUPE_AGENTS).exists()
    )


class EstAdministrateur(BasePermission):
    message = "Réservé à l'administrateur."

    def has_permission(self, request, view):
        return est_administrateur(request.user)


class EstAgentOuAdministrateur(BasePermission):
    message = "Réservé aux agents de scan et à l'administrateur."

    def has_permission(self, request, view):
        return est_administrateur(request.user) or est_agent(request.user)
