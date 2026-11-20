"""
Les ÉVÉNEMENTS (administrateur) : lister, voir, créer, modifier, supprimer, lire les participations, exporter en Excel, envoyer le lien.
"""
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ...models import Evenement
from ...services.excel import TYPE_EXCEL, construire_classeur, nom_fichier
from ...services.invitations import adresses_diffusion, envoyer_invitations
from ..permissions import EstAdministrateur
from ..serializers import EvenementSerializer, InscriptionSerializer


@extend_schema(tags=["Événements (administrateur)"])
class EvenementViewSet(viewsets.ModelViewSet):
    """
    Les événements : lister, voir, créer, modifier et supprimer. Réservé à l'administrateur.
    À la création, le serveur fabrique tout seul le **lien d'inscription** à envoyer aux employés.
    """

    queryset = Evenement.objects.all()
    serializer_class = EvenementSerializer
    permission_classes = [EstAdministrateur]

    @extend_schema(summary="Liste des inscrits d'un événement", responses=InscriptionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def inscriptions(self, request, pk=None):
        """La liste des inscrits de cet événement, avec la colonne « present » (vrai ou faux)."""
        evenement = self.get_object()
        return Response(InscriptionSerializer(evenement.inscriptions.all(), many=True).data)


    @extend_schema(summary="Exporter les inscrits en Excel", responses={200: OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        """Le fichier Excel des inscrits de cet événement (un fichier = un événement)."""
        evenement = self.get_object()
        reponse = HttpResponse(construire_classeur(evenement, evenement.inscriptions.all()), content_type=TYPE_EXCEL)
        reponse["Content-Disposition"] = f'attachment; filename="{nom_fichier(evenement)}"'
        return reponse

    @extend_schema(
        summary="Envoyer le lien d'inscription à tous les employés", request=None, responses={200: OpenApiTypes.OBJECT},
        description="Envoie le lien d'inscription par e-mail à la liste de diffusion de l'entreprise (réglage ADRESSES_DIFFUSION). "
                    "Les adresses déjà inscrites à cet événement sont ignorées.",
    )
    @action(detail=True, methods=["post"])
    def inviter(self, request, pk=None):
        evenement = self.get_object()
        if not evenement.inscriptions_ouvertes:
            return Response({"detail": "Les inscriptions sont closes : le lien d'inscription a expiré."}, status=status.HTTP_400_BAD_REQUEST)
        if evenement.complet:
            return Response({"detail": "Cet événement est complet : toutes les places sont prises."}, status=status.HTTP_400_BAD_REQUEST)
        diffusion = adresses_diffusion()
        if not diffusion:
            return Response({"detail": "Aucune liste de diffusion n'est configurée (ADRESSES_DIFFUSION dans les réglages)."},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(envoyer_invitations(evenement, diffusion))
