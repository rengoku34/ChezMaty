"""
Les VUES DE L'API : le code qui répond quand quelqu'un appelle une adresse de l'API.
"""
from django.conf import settings
from django.http import HttpResponse
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import generics, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.decorators import action, api_view
from rest_framework.parsers import FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Evenement
from .permissions import EstAdministrateur, EstAgentOuAdministrateur, est_administrateur, est_agent
from .serializers import (
    EvenementSerializer,
    InscriptionPubliqueSerializer,
    InscriptionSerializer,
    ScanEntreeSerializer,
    ScanReponseSerializer,
)
from .services.billets import envoyer_billet
from .services.excel import TYPE_EXCEL, construire_classeur, nom_fichier
from .services.invitations import adresses_diffusion, envoyer_invitations
from .services.scan import traiter_scan


# ---------------------------------------------------------------------------
# Le jeton : le « bracelet » qui prouve qui on est
# ---------------------------------------------------------------------------
@extend_schema(tags=["Compte"], summary="Se connecter : obtenir un jeton", auth=[])
class ConnexionJetonView(ObtainAuthToken):
    """
    Envoyez votre e-mail (`username`) et votre mot de passe : vous recevez un **jeton**.
    Ensuite, vous ne renvoyez plus le mot de passe : vous écrivez `Authorization: Token <jeton>` dans chaque demande.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    parser_classes = [JSONParser, FormParser]        # on reçoit du JSON (comme les autres adresses)
    throttle_classes = [ScopedRateThrottle]          # protège contre ceux qui essaient des milliers de mots de passe
    throttle_scope = "connexion"


@extend_schema(tags=["Compte"], summary="Qui suis-je ? (nom et rôle)", responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def moi(request):
    """Le nom et le rôle de la personne connectée : les applications web et mobile s'en servent après la connexion."""
    if est_administrateur(request.user):
        role = "administrateur"
    elif est_agent(request.user):
        role = "agent"
    else:
        role = "aucun"
    diffusion = adresses_diffusion() if role == "administrateur" else []
    return Response({"username": request.user.get_username(), "role": role, "diffusion": diffusion})


@extend_schema(tags=["Compte"], summary="Se déconnecter : supprimer son jeton", request=None, responses={204: None})
@api_view(["POST"])
def deconnexion_jeton(request):
    """Supprime le jeton : il ne fonctionnera plus jamais (comme un bracelet coupé)."""
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Côté administrateur
# ---------------------------------------------------------------------------
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
            return Response({"detail": "Cet événement est terminé : le lien d'inscription a expiré."}, status=status.HTTP_400_BAD_REQUEST)
        diffusion = adresses_diffusion()
        if not diffusion:
            return Response({"detail": "Aucune liste de diffusion n'est configurée (ADRESSES_DIFFUSION dans les réglages)."},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(envoyer_invitations(evenement, diffusion))


# ---------------------------------------------------------------------------
# Côté public : les employés qui ouvrent le lien d'un événement (aucune connexion demandée)
# ---------------------------------------------------------------------------
@extend_schema(tags=["Public (employés)"], summary="S'inscrire à un événement", auth=[])
class InscriptionPubliqueView(generics.CreateAPIView):
    """
    Le formulaire d'inscription d'un employé. Une même adresse e-mail ne peut s'inscrire qu'une fois.
    Après l'inscription, le QR code est envoyé par e-mail.
    """

    serializer_class = InscriptionPubliqueSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "inscription"

    def get_serializer_context(self):
        contexte = super().get_serializer_context()
        if not getattr(self, "swagger_fake_view", False):         # (la page /docs/ fabrique la vue « pour de faux »)
            contexte["evenement"] = get_object_or_404(Evenement, lien=self.kwargs["lien"])
        return contexte

    def perform_create(self, serializer):
        evenement = serializer.context["evenement"]
        inscription = serializer.save(evenement=evenement)
        inscription.evenement = evenement          # (déjà chargé : l'envoi de l'e-mail n'aura pas besoin de la base)
        envoyer_billet(inscription)                # le QR code part par e-mail
        self.inscription = inscription

    def create(self, request, *args, **kwargs):
        if not get_object_or_404(Evenement, lien=self.kwargs["lien"]).inscriptions_ouvertes:
            return Response({"detail": "Les inscriptions sont closes : ce lien a expiré."}, status=status.HTTP_410_GONE)
        try:
            reponse = super().create(request, *args, **kwargs)
        except IntegrityError:
            # Deux envois au même instant avec la même adresse : la base de données refuse le second.
            return Response(
                {"email": ["Cette adresse e-mail est déjà inscrite à cet événement."]},
                status=status.HTTP_409_CONFLICT,
            )
        if settings.MODE_SANS_EMAIL:
            # Aucun vrai service d'e-mail (essais sur un ordinateur) : on donne aussi l'adresse du billet à l'écran.
            reponse.data["billet"] = f"/billet/{self.inscription.qr_token}/"
        return reponse


# ---------------------------------------------------------------------------
# Le scan des QR codes
# ---------------------------------------------------------------------------
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
