import secrets

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower

from .services import formatting


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra):
        email = (email or '').strip().lower()
        if not email:
            raise ValueError('Adresse e-mail obligatoire.')
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        return self.create_user(email, password, **extra)

    def by_email(self, email):
        return self.filter(email__iexact=(email or '').strip()).first()


class User(AbstractBaseUser):
    """Employé de SNEDAI. Le rôle d'administrateur vient de ADMIN_EMAILS, jamais de la base."""

    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    filiale = models.CharField(max_length=100)
    email = models.EmailField(max_length=200, unique=True)
    google_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    is_agent = models.BooleanField('agent de scan', default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nom', 'prenom', 'filiale']

    class Meta:
        ordering = ['nom', 'prenom']
        constraints = [models.UniqueConstraint(Lower('email'), name='users_email_lower')]

    def __str__(self):
        return f'{self.prenom} {self.nom}'

    @property
    def is_admin(self):
        return self.email.lower() in settings.ADMIN_EMAILS

    @property
    def can_scan(self):
        return self.is_agent or self.is_admin

    @property
    def role(self):
        return 'admin' if self.is_admin else 'agent' if self.is_agent else 'employe'

    # Interface d'administration de Django (/django-admin/) : réservée aux adresses de ADMIN_EMAILS.
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


class EventManager(models.Manager):
    def get_queryset(self):
        # Le contenu de la photo (dans la base) n'est chargé que pour l'afficher.
        return super().get_queryset().defer('photo_data')


class Event(models.Model):
    titre = models.CharField('sujet', max_length=150)
    description = models.TextField(max_length=5000)
    photo_data = models.BinaryField(null=True, blank=True, editable=False)
    photo_type = models.CharField(max_length=40, null=True, blank=True, editable=False)
    # Horaires « muraux » saisis dans le formulaire (2026-11-14T09:00), sans fuseau.
    debut = models.CharField('début', max_length=16, blank=True, default='')
    fin = models.CharField(max_length=16, blank=True, default='')
    lieu = models.CharField(max_length=200, blank=True, default='')
    termine_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = EventManager()

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.titre

    @property
    def has_photo(self):
        return bool(self.photo_type)

    @property
    def termine(self):
        return self.termine_at is not None

    @property
    def range_text(self):
        return formatting.event_range(self.debut, self.fin)

    @property
    def date_text(self):
        return formatting.event_date(self.debut)

    @property
    def day_text(self):
        return formatting.event_date(self.debut).split(' à ')[0]

    @property
    def hours_text(self):
        return formatting.event_hours(self.debut, self.fin)

    @property
    def day_chip(self):
        return formatting.event_day(self.debut)


def new_qr_token():
    return secrets.token_urlsafe(24)


class Participation(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='participations')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='participations')
    qr_token = models.CharField(max_length=64, unique=True, default=new_qr_token)
    confirme_at = models.DateTimeField(auto_now_add=True)
    scanne_at = models.DateTimeField(null=True, blank=True)
    # Supprimer un agent ne supprime pas les scans qu'il a faits (ils restent, sans nom d'agent).
    scanne_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='scans')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['event', 'user'], name='one_participation_per_user_and_event')]

    def __str__(self):
        return f'{self.user} → {self.event}'


class ApiToken(models.Model):
    """Jeton de connexion de l'application mobile (seule l'empreinte est gardée)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='api_tokens')
    token_hash = models.CharField(max_length=64, unique=True)
    device = models.CharField(max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()


class PendingSignup(models.Model):
    """Inscription en attente du code reçu par e-mail (application mobile)."""

    id = models.CharField(max_length=64, primary_key=True)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    filiale = models.CharField(max_length=100)
    email = models.EmailField(max_length=200)
    password_hash = models.CharField(max_length=256)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField(auto_now_add=True)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
