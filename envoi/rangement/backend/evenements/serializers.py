"""
Les SERIALIZERS : ils traduisent un objet Python en JSON (le texte échangé par l'API) et inversement,
et ils VÉRIFIENT les données reçues.
"""
from django.conf import settings
from rest_framework import serializers

from .validators import chiffres_du_telephone
from .models import Evenement, Inscription, Lieu, moment_de_fin
from .services.conflits import message_conflit, normaliser, trouver_conflit


# ---------------------------------------------------------------------------
# Côté administrateur : les événements et les inscrits
# ---------------------------------------------------------------------------
class LieuSerializer(serializers.ModelSerializer):
    """Un lieu, tel que l'administrateur le gère (page « Lieux »)."""

    nombre_evenements = serializers.SerializerMethodField()

    class Meta:
        model = Lieu
        fields = ["id", "nom", "nombre_evenements"]

    def validate_nom(self, nom):
        nom = " ".join(nom.split())
        if not nom:
            raise serializers.ValidationError("Saisissez le nom du lieu.")
        cle = normaliser(nom)
        for autre in Lieu.objects.exclude(pk=self.instance.pk if self.instance else None):
            if normaliser(autre.nom) == cle:
                raise serializers.ValidationError(f"Ce lieu existe déjà : « {autre.nom} ».")
        return nom

    def get_nombre_evenements(self, lieu) -> int:
        return lieu.evenements.count()


class LieuParNom(serializers.SlugRelatedField):
    """Le lieu d'un événement s'écrit par son nom (« Salle Plateau ») ; majuscules et espaces en trop sont ignorés."""

    def to_internal_value(self, donnee):
        nom = " ".join(str(donnee).split())
        lieu = self.get_queryset().filter(nom__iexact=nom).first()
        if lieu is None:
            self.fail("does_not_exist", slug_name=self.slug_field, value=donnee)
        return lieu


class EvenementSerializer(serializers.ModelSerializer):
    """Un événement, tel que l'administrateur le gère."""

    lieu = LieuParNom(slug_field="nom", queryset=Lieu.objects.all(), error_messages={
        "does_not_exist": "Ce lieu n'existe pas : choisissez-le dans la liste, ou ajoutez-le d'abord dans « Lieux ».",
    })
    url_inscription = serializers.CharField(read_only=True)
    nombre_inscrits = serializers.SerializerMethodField()
    nombre_presents = serializers.SerializerMethodField()
    inscriptions_ouvertes = serializers.BooleanField(read_only=True)
    places_restantes = serializers.IntegerField(read_only=True, allow_null=True)
    complet = serializers.BooleanField(read_only=True)

    class Meta:
        model = Evenement
        fields = [
            "id", "nom", "date", "description", "lieu", "creneaux",
            "inscriptions_jusqu_au", "places", "places_restantes", "complet",
            "lien", "url_inscription", "inscriptions_ouvertes", "nombre_inscrits", "nombre_presents", "cree_le",
        ]
        read_only_fields = ["id", "lien", "cree_le"]      # calculés par le serveur : on ne les envoie pas

    def validate(self, donnees):
        """Deux événements ne peuvent pas occuper le même lieu à des heures qui se chevauchent ; la date limite et le nombre de places doivent être cohérents."""
        instance = self.instance
        date = donnees.get("date", instance.date if instance else None)
        creneaux = donnees.get("creneaux", instance.creneaux if instance else [])
        limite = donnees.get("inscriptions_jusqu_au", instance.inscriptions_jusqu_au if instance else None)
        if limite and date and limite > moment_de_fin(date, creneaux):
            raise serializers.ValidationError({"inscriptions_jusqu_au": "La date limite ne peut pas être après la fin de l'événement."})
        places = donnees.get("places", instance.places if instance else None)
        if instance and places is not None and places < instance.inscriptions.count():
            raise serializers.ValidationError({"places": f"Il y a déjà {instance.inscriptions.count()} inscrit(s) : le nombre de places ne peut pas être plus petit."})
        # On ne vérifie que si le lieu, la date ou les créneaux changent (modifier seulement la description ne doit rien bloquer).
        if instance is None or any(c in donnees and donnees[c] != getattr(instance, c) for c in ("lieu", "date", "creneaux")):
            lieu = donnees.get("lieu", instance.lieu if instance else None)
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

    def validate_telephone(self, telephone):
        return chiffres_du_telephone(telephone)      # on enregistre seulement les 10 chiffres

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
