import secrets
import string
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from .validators import valider_creneaux, valider_telephone

ALPHABET = string.ascii_letters + string.digits      # lettres et chiffres seulement


def code_secret(longueur):
    """Un code aléatoire impossible à deviner."""
    return "".join(secrets.choice(ALPHABET) for _ in range(longueur))


def nouveau_lien():
    """Le code secret du lien d'inscription d'un événement (12 caractères)."""
    return code_secret(12)


def nouveau_jeton():
    """Le code secret contenu dans le QR code d'une inscription (32 caractères)."""
    return code_secret(32)


class Lieu(models.Model):
    """Un lieu où se tiennent les événements (salle, amphi, siège...). L'administrateur les gère dans la page « Lieux »."""

    nom = models.CharField(max_length=200)

    class Meta:
        ordering = ["nom"]
        verbose_name = "lieu"
        verbose_name_plural = "lieux"
        constraints = [models.UniqueConstraint(Lower("nom"), name="un_seul_lieu_par_nom")]     # « Salle A » et « salle a » : un seul lieu

    def __str__(self):
        return self.nom

    def save(self, *args, **kwargs):
        self.nom = " ".join((self.nom or "").split())          # pas d'espaces en trop
        super().save(*args, **kwargs)


class Evenement(models.Model):
    """Un événement organisé par l'entreprise (conférence, séminaire...)."""

    nom = models.CharField("nom de l'événement", max_length=150)
    date = models.DateField("date de l'événement")
    description = models.TextField(blank=True)
    lieu = models.ForeignKey(Lieu, on_delete=models.PROTECT, related_name="evenements")      # un lieu utilisé ne peut pas être supprimé
    creneaux = models.JSONField(
        "créneaux horaires", default=list, blank=True, validators=[valider_creneaux],
        help_text="4 au maximum, par exemple : 09:00-10:00",
    )
    lien = models.CharField("code du lien d'inscription", max_length=12, unique=True, default=nouveau_lien, editable=False)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]       # les événements les plus récents d'abord
        verbose_name = "événement"

    def __str__(self):
        return self.nom

    @property
    def url_inscription(self):
        """L'adresse à envoyer aux employés pour qu'ils s'inscrivent."""
        return f"{settings.APP_URL}/e/{self.lien}/"

    @property
    def fin(self):
        """Le moment où les inscriptions se ferment : la fin du dernier créneau, ou minuit (fin du jour J) s'il n'y a pas de créneau."""
        if self.creneaux:
            heures, minutes = max(creneau.split("-")[1] for creneau in self.creneaux).split(":")
            moment = datetime.combine(self.date, time(int(heures), int(minutes)))
        else:
            moment = datetime.combine(self.date + timedelta(days=1), time(0, 0))
        return timezone.make_aware(moment)

    @property
    def inscriptions_ouvertes(self):
        """Vrai tant que l'événement n'est pas terminé : ensuite, le lien d'inscription a expiré."""
        return timezone.now() < self.fin


class Inscription(models.Model):
    """Une personne inscrite à un événement."""

    evenement = models.ForeignKey(Evenement, on_delete=models.CASCADE, related_name="inscriptions", verbose_name="événement")
    nom = models.CharField(max_length=100)
    prenom = models.CharField("prénom", max_length=100)
    filiale = models.CharField(max_length=100)
    telephone = models.CharField("numéro de téléphone", max_length=30, validators=[valider_telephone])
    email = models.EmailField("adresse e-mail", max_length=200)
    creneau = models.CharField("créneau choisi", max_length=20, blank=True)
    qr_token = models.CharField("code du QR code", max_length=32, unique=True, default=nouveau_jeton, editable=False)
    present = models.BooleanField("présent", default=False)           # Faux tant que le QR code n'est pas scanné
    scanne_le = models.DateTimeField("scanné le", null=True, blank=True)
    scanne_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="scans", verbose_name="scanné par",
    )
    cree_le = models.DateTimeField("inscrit le", auto_now_add=True)

    class Meta:
        ordering = ["nom", "prenom"]
        verbose_name = "inscription"
        # Une même adresse e-mail ne peut s'inscrire qu'UNE fois par événement (majuscules ignorées).
        constraints = [
            models.UniqueConstraint(Lower("email"), "evenement", name="une_inscription_par_email_et_evenement"),
        ]

    def __str__(self):
        return f"{self.prenom} {self.nom} ({self.evenement})"

    @property
    def url_billet(self):
        """La page du billet (avec le QR code). Seul le code secret y donne accès."""
        return f"{settings.APP_URL}/billet/{self.qr_token}/"
