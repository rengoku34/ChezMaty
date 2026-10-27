"""
Les MODÈLES : la description des données du site.

Chaque classe ci-dessous devient une TABLE dans la base de données.
Chaque attribut (models.CharField, etc.) devient une COLONNE de cette table.

Trois tables seulement :
  - User        : les comptes qui SE CONNECTENT (l'administrateur, et les agents de scan) ;
  - Event       : un événement, avec son lien d'inscription ;
  - Inscription : une personne inscrite à un événement (avec son QR code et « présent » vrai ou faux).
Les employés qui s'inscrivent n'ont PAS de compte : ils remplissent seulement le formulaire du lien.
"""
import secrets

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower

from .services import formatting


# ---------------------------------------------------------------------------
# 1. Les comptes qui se connectent (administrateur et agents de scan)
# ---------------------------------------------------------------------------
class GestionnaireUtilisateurs(BaseUserManager):
    """Le « gestionnaire » sait créer des utilisateurs (c'est lui qui hache le mot de passe)."""

    def create_user(self, email, password=None, **autres_champs):
        email = (email or '').strip().lower()      # une adresse e-mail est toujours enregistrée en minuscules
        if not email:
            raise ValueError('Adresse e-mail obligatoire.')
        utilisateur = self.model(email=email, **autres_champs)
        if password:
            utilisateur.set_password(password)     # le mot de passe est HACHÉ : impossible à relire, même pour nous
        else:
            utilisateur.set_unusable_password()
        utilisateur.save(using=self._db)
        return utilisateur

    def create_superuser(self, email, password=None, **autres_champs):
        # Utilisé par « python manage.py createsuperuser » : c'est ainsi qu'on crée le compte administrateur.
        return self.create_user(email, password, **autres_champs)

    def get_by_natural_key(self, email):
        """Utilisé par la connexion de Django : on ignore les majuscules et les espaces autour de l'adresse."""
        return self.get(email__iexact=(email or '').strip())

    def par_email(self, email):
        """Cherche un utilisateur par son adresse, sans tenir compte des majuscules."""
        return self.filter(email__iexact=(email or '').strip()).first()


class User(AbstractBaseUser):
    """Un compte du backoffice : l'administrateur (défini par ADMIN_EMAILS) ou un agent de scan."""

    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    email = models.EmailField(max_length=200, unique=True)
    is_agent = models.BooleanField('agent de scan', default=False)   # peut seulement scanner les QR codes
    created_at = models.DateTimeField(auto_now_add=True)

    objects = GestionnaireUtilisateurs()
    USERNAME_FIELD = 'email'                        # on se connecte avec l'e-mail (pas un « nom d'utilisateur »)
    REQUIRED_FIELDS = ['nom', 'prenom']             # demandés par « createsuperuser »

    class Meta:
        ordering = ['nom', 'prenom']
        constraints = [models.UniqueConstraint(Lower('email'), name='users_email_lower')]

    def __str__(self):
        return f'{self.prenom} {self.nom}'

    # --- Les rôles. Ils se déduisent de la configuration, JAMAIS d'un champ modifiable par l'utilisateur. ---
    @property
    def is_admin(self):
        """Administrateur = son adresse est dans ADMIN_EMAILS (fichier .env)."""
        return self.email.lower() in settings.ADMIN_EMAILS

    @property
    def can_scan(self):
        """Peut scanner les QR codes : un agent nommé, ou l'administrateur."""
        return self.is_agent or self.is_admin

    @property
    def role(self):
        return 'admin' if self.is_admin else 'agent'

    # --- Ce que l'interface d'administration de Django (/django-admin/) exige d'un utilisateur ---
    @property
    def is_staff(self):
        return self.is_admin

    @property
    def is_superuser(self):
        return self.is_admin

    @property
    def is_active(self):
        return True

    def has_perm(self, perm, obj=None):
        return self.is_admin

    def has_module_perms(self, app_label):
        return self.is_admin


# ---------------------------------------------------------------------------
# 2. L'événement
# ---------------------------------------------------------------------------
MAX_CRENEAUX = 4      # nombre maximum de créneaux horaires par événement


def nouveau_lien():
    """Le code secret du lien d'inscription (/e/xxxx) : impossible à deviner."""
    return secrets.token_urlsafe(9)


class Event(models.Model):
    """Un événement créé par l'administrateur. Il a un LIEN D'INSCRIPTION public."""

    titre = models.CharField('nom de l’événement', max_length=150)
    description = models.TextField(max_length=5000)
    # Horaires saisis tels quels (« 2026-11-14T09:00 ») : heure du mur, sans fuseau, pour éviter les décalages.
    debut = models.CharField('date et heure de début', max_length=16, blank=True, default='')
    fin = models.CharField('date et heure de fin', max_length=16, blank=True, default='')
    lieu = models.CharField(max_length=200, blank=True, default='')
    # Les créneaux horaires proposés à l'inscription (jusqu'à 4), un par ligne : « 09:00 – 11:00 ».
    creneaux = models.TextField('créneaux horaires', blank=True, default='')
    lien = models.CharField(max_length=40, unique=True, default=nouveau_lien, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']   # les plus récents d'abord

    def __str__(self):
        return self.titre

    @property
    def liste_creneaux(self):
        """Les créneaux sous forme de liste : ['09:00 – 11:00', '11:00 – 13:00', ...] (vide s'il n'y en a pas)."""
        return [ligne.strip() for ligne in self.creneaux.splitlines() if ligne.strip()]

    @property
    def creneaux_formulaire(self):
        """Toujours 4 lignes pour le formulaire : [{'n': 1, 'debut': '09:00', 'fin': '11:00'}, ... , {'n': 4, 'debut': '', 'fin': ''}]"""
        lignes = [{'n': n + 1, 'debut': '', 'fin': ''} for n in range(MAX_CRENEAUX)]
        for ligne, creneau in zip(lignes, self.liste_creneaux):
            ligne['debut'], _, ligne['fin'] = creneau.partition(' – ')
        return lignes

    @property
    def url_inscription(self):
        """Le lien complet à partager avec les employés."""
        return f'{settings.APP_URL}/e/{self.lien}'

    # --- Textes prêts à afficher dans les gabarits (la mise en forme est dans services/formatting.py) ---
    @property
    def range_text(self):
        """« samedi 14 novembre 2026 à 09:00 – 16:00 »"""
        return formatting.event_range(self.debut, self.fin)

    @property
    def day_text(self):
        """« samedi 14 novembre 2026 » (sans l'heure)"""
        return formatting.event_date(self.debut).split(' à ')[0]

    @property
    def hours_text(self):
        """« 09:00 – 16:00 »"""
        return formatting.event_hours(self.debut, self.fin)

    @property
    def day_chip(self):
        """La pastille de date des cartes : {'jour': '14', 'mois': 'nov'}"""
        return formatting.event_day(self.debut)


# ---------------------------------------------------------------------------
# 3. L'inscription = une personne inscrite à un événement
# ---------------------------------------------------------------------------
def nouveau_jeton_qr():
    """Un code secret impossible à deviner, qui sera dans le QR code (24 octets aléatoires)."""
    return secrets.token_urlsafe(24)


class Inscription(models.Model):
    """Quand quelqu'un remplit le formulaire du lien, on crée une ligne ici.

    « present » vaut FAUX à l'inscription, et passe à VRAI quand son QR code est scanné.
    """

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='inscriptions')   # supprimer l'événement supprime ses inscriptions
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    filiale = models.CharField(max_length=100)
    telephone = models.CharField('numéro de téléphone', max_length=30)
    email = models.EmailField(max_length=200)
    creneau = models.CharField('créneau horaire choisi', max_length=40, blank=True, default='')   # ex. « 09:00 – 11:00 »
    qr_token = models.CharField(max_length=64, unique=True, default=nouveau_jeton_qr)
    present = models.BooleanField(default=False)                  # FAUX tant que le QR n'est pas scanné
    scanne_at = models.DateTimeField(null=True, blank=True)       # quand il a été scanné
    # Qui a scanné. Si l'agent est supprimé, on garde le scan mais sans son nom (SET_NULL).
    scanne_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='scans')
    created_at = models.DateTimeField(auto_now_add=True)          # date d'inscription

    class Meta:
        ordering = ['nom', 'prenom']
        # Une même adresse e-mail ne peut s'inscrire qu'UNE fois par événement (majuscules ignorées).
        constraints = [models.UniqueConstraint(Lower('email'), 'event', name='une_inscription_par_email_et_evenement')]

    def __str__(self):
        return f'{self.prenom} {self.nom} → {self.event}'

    @property
    def url_billet(self):
        """La page publique du billet (QR code), accessible seulement avec le code secret."""
        return f'{settings.APP_URL}/billet/{self.qr_token}'
