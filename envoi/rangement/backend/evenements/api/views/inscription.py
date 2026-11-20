"""
L'INSCRIPTION d'un employé (sans compte) : le formulaire envoie ses données ici ; le QR code part ensuite par e-mail.
"""
from django.conf import settings
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from ...models import Evenement
from ...services.billets import envoyer_billet
from ..serializers import InscriptionPubliqueSerializer


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
        try:
            with transaction.atomic():              # la vérification des places et l'inscription forment un seul bloc : pas de place en trop
                evenement = get_object_or_404(Evenement, lien=self.kwargs["lien"])
                if not evenement.inscriptions_ouvertes:
                    return Response({"detail": "Les inscriptions sont closes : ce lien a expiré."}, status=status.HTTP_410_GONE)
                if evenement.complet:
                    return Response({"detail": "Désolé, toutes les places sont prises."}, status=status.HTTP_409_CONFLICT)
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
