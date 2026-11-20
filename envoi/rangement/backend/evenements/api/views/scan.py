"""
Le SCAN des QR codes : l'agent (ou l'administrateur) envoie le texte lu, le serveur répond « présent », « déjà » ou « inconnu ».
"""
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from ...services.scan import traiter_scan
from ..permissions import EstAgentOuAdministrateur
from ..serializers import ScanEntreeSerializer, ScanReponseSerializer


class ScanView(APIView):
    """Un agent (ou l'administrateur) envoie le texte lu dans un QR code ; le serveur répond « présent », « déjà » ou « inconnu »."""

    permission_classes = [EstAgentOuAdministrateur]

    @extend_schema(
        tags=["Scan (agents)"], summary="Scanner un QR code",
        request=ScanEntreeSerializer,
        responses={200: ScanReponseSerializer, 404: ScanReponseSerializer, 409: ScanReponseSerializer},
        description=(
            "**200** : présence confirmée (la colonne *present* passe à Vrai).  \n"
            "**409** : ce QR code a déjà été scanné.  \n"
            "**404** : QR code inconnu."
        ),
    )
    def post(self, request):
        entree = ScanEntreeSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        code_http, reponse = traiter_scan(entree.validated_data["code"], request.user)
        return Response(reponse, status=code_http)
