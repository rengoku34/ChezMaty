"""
Les SERIALIZERS : ils traduisent un objet Python en JSON (le texte échangé par l'API) et inversement,
et ils VÉRIFIENT les données reçues.
"""
from django.conf import settings
from rest_framework import serializers

from .models import Evenement, Inscription
from .services.conflits import message_conflit, trouver_conflit


# ---------------------------------------------------------------------------
# Côté administrateur : les événements et les inscrits
# ---------------------------------------------------------------------------
class EvenementSerializer(serializers.ModelSerializer):
    """Un événement, tel que l'administrateur le gère."""

    url_inscription = serializers.CharField(read_only=True)
    nombre_inscrits = serializers.SerializerMethodField()
    nombre_presents = serializers.SerializerMethodField()

    class Meta:
        model = Evenement
        fields = [
            "id", "nom", "date", "description", "lieu", "creneaux",
            "lien", "url_inscription", "nombre_inscrits", "nombre_presents", "cree_le",
        ]
        read_only_fields = ["id", "lien", "cree_le"]      # calculés par le serveur : on ne les envoie pas

    def validate(self, donnees):
        """Deux événements ne peuvent pas occuper le même lieu, le même jour, à des heures qui se chevauchent."""
        instance = self.instance
        # On ne vérifie que si le lieu, la date ou les créneaux changent (modifier seulement la description ne doit rien bloquer).
        if instance is None or any(c in donnees and donnees[c] != getattr(instance, c) for c in ("lieu", "date", "creneaux")):
            lieu = donnees.get("lieu", instance.lieu if instance else "")
            date = donnees.get("date", instance.date if instance else None)
            creneaux = donnees.get("creneaux", instance.creneaux if instance else [])
            if lieu and date:
                autre = trouver_conflit(lieu, date, creneaux, instance.pk if instance else None)
                if autre:
                    raise serializers.ValidationError({"lieu": message_conflit(autre)})
        return donnees

    def get_nombre_inscrits(self, evenement) -> int:
        return evenement.inscriptions.count()

    def get_nombre_presents(self, evenement) -> int:
        return evenement.inscriptions.filter(present=True).count()


class InscriptionSerializer(serializers.ModelSerializer):
    """Une inscription, telle que l'administrateur la voit (avec la colonne « present »)."""

    class Meta:
        model = Inscription
        fields = ["id", "nom", "prenom", "filiale", "telephone", "email", "creneau", "present", "scanne_le", "cree_le"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Côté public : ce que voit et envoie un employé qui ouvre le lien d'un événement
# ---------------------------------------------------------------------------
class InscriptionPubliqueSerializer(serializers.ModelSerializer):
    """Le formulaire d'inscription : on reçoit seulement ces 6 champs, tous vérifiés.
    Un employé ne peut donc jamais envoyer « present = true » : le serveur ignore tout le reste."""

    class Meta:
        model = Inscription
        fields = ["nom", "prenom", "filiale", "telephone", "email", "creneau"]

    def validate_filiale(self, filiale):
        if filiale not in settings.FILIALES:
            raise serializers.ValidationError("Choisissez une filiale dans la liste.")
        return filiale

    def validate_email(self, email):
        return email.strip().lower()      # on enregistre toujours en minuscules

    def validate(self, donnees):
        """Vérifications qui demandent plusieurs champs ou l'événement (reçu par la vue dans `context`)."""
        evenement = self.context["evenement"]
        creneau = donnees.get("creneau", "")
        if evenement.creneaux and creneau not in evenement.creneaux:
            raise serializers.ValidationError({"creneau": "Choisissez un créneau horaire de la liste."})
        if not evenement.creneaux:
            donnees["creneau"] = ""        # l'événement n'a pas de créneaux : on ignore ce champ
        if Inscription.objects.filter(evenement=evenement, email__iexact=donnees["email"]).exists():
            raise serializers.ValidationError({"email": "Cette adresse e-mail est déjà inscrite à cet événement."})
        return donnees


# ---------------------------------------------------------------------------
# Le scan
# ---------------------------------------------------------------------------
class ScanEntreeSerializer(serializers.Serializer):
    """Ce que l'agent envoie : le texte lu dans le QR code."""

    code = serializers.CharField(max_length=200, help_text="Le texte lu dans le QR code (SNEDAI-EVT:...)")


class PersonneScanneeSerializer(serializers.Serializer):
    """La personne qui vient d'être scannée (affichée à l'écran de l'agent)."""

    nom = serializers.CharField()
    prenom = serializers.CharField()
    filiale = serializers.CharField()
    evenement = serializers.CharField()
    creneau = serializers.CharField(allow_blank=True)


class ScanReponseSerializer(serializers.Serializer):
    """La réponse du serveur : présent, déjà scanné, ou inconnu."""

    statut = serializers.ChoiceField(choices=["present", "deja", "inconnu"])
    message = serializers.CharField()
    personne = PersonneScanneeSerializer(required=False)
