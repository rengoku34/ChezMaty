"""
Les LIEUX des événements (administrateur) : lister, ajouter, renommer, supprimer.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.response import Response

from ...models import Lieu
from ..permissions import EstAdministrateur
from ..serializers import LieuSerializer


@extend_schema(tags=["Lieux (administrateur)"])
class LieuViewSet(viewsets.ModelViewSet):
    """Les lieux des événements : lister, ajouter, renommer et supprimer. Réservé à l'administrateur."""

    queryset = Lieu.objects.all()
    serializer_class = LieuSerializer
    permission_classes = [EstAdministrateur]

    def destroy(self, request, *args, **kwargs):
        lieu = self.get_object()
        utilises = lieu.evenements.count()
        if utilises:
            return Response({"detail": f"Ce lieu est utilisé par {utilises} événement(s) : changez le lieu de ces événements avant de le supprimer."},
                            status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)
