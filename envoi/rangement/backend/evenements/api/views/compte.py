"""
Le COMPTE : se connecter (jeton), savoir qui je suis, se déconnecter, et « le serveur répond-il ? ».
"""
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from ...services.invitations import adresses_diffusion
from ..authentification import expiration, jeton_expire
from ..permissions import est_administrateur, est_agent


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

    def post(self, request, *args, **kwargs):
        entree = self.serializer_class(data=request.data, context={"request": request})
        entree.is_valid(raise_exception=True)
        utilisateur = entree.validated_data["user"]
        jeton = Token.objects.filter(user=utilisateur).first()
        if jeton and jeton_expire(jeton):             # un jeton trop ancien est remplacé ; sinon on le garde (un autre appareil peut l'utiliser)
            jeton.delete()
            jeton = None
        if jeton is None:
            jeton = Token.objects.create(user=utilisateur)
        return Response({"token": jeton.key, "expire_le": expiration(jeton).isoformat()})


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
    expire_le = expiration(request.auth).isoformat() if isinstance(request.auth, Token) else None
    return Response({"username": request.user.get_username(), "role": role, "diffusion": diffusion, "expire_le": expire_le})


@extend_schema(tags=["Compte"], summary="Le serveur répond-il ? (l'application mobile s'en sert pour retrouver le serveur)", auth=[],
               responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def ping(request):
    """Répond toujours la même chose : l'application mobile reconnaît ainsi le serveur SNEDAI sur le réseau."""
    return Response({"application": "snedai-evenements"})


@extend_schema(tags=["Compte"], summary="Se déconnecter : supprimer son jeton", request=None, responses={204: None})
@api_view(["POST"])
def deconnexion_jeton(request):
    """Supprime le jeton : il ne fonctionnera plus jamais (comme un bracelet coupé)."""
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
