from datetime import datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from evenements.models import Event, Participation, User


class Command(BaseCommand):
    help = 'Crée des comptes et des événements de démonstration (essais en local uniquement).'

    def handle(self, *args, **options):
        if settings.PRODUCTION:
            raise CommandError('Cette commande est réservée aux essais en local.')
        password = 'motdepasse1'
        people = [
            ('admin@test.ci', 'Admin', 'Boss', 'SNEDAI', False),
            ('awa@test.ci', 'Kone', 'Awa', 'SNEDAI Telecom', False),
            ('moussa@test.ci', 'Traore', 'Moussa', 'SNEDAI', True),
            ('issa@test.ci', 'Diallo', 'Issa', 'SNEDAI Telecom', False),
        ]
        for email, nom, prenom, filiale, agent in people:
            if not User.objects.by_email(email):
                User.objects.create_user(email, password, nom=nom, prenom=prenom, filiale=filiale, is_agent=agent)
        if not Event.objects.exists():
            soon = datetime.now() + timedelta(days=18)
            Event.objects.create(titre='Journée bien-être SNEDAI', description='Une journée pour prendre soin de soi : ateliers, repas partagé et activités.',
                                 debut=soon.strftime('%Y-%m-%dT09:00'), fin=soon.strftime('%Y-%m-%dT16:00'), lieu='Siège SNEDAI')
            old = Event.objects.create(titre='Séminaire de rentrée', description='Présentation des objectifs de l’année.', debut='2026-01-20T09:00', fin='2026-01-20T12:00', lieu='Salle de conférence',
                                       termine_at=timezone.now())
            for user in User.objects.exclude(email='admin@test.ci'):
                Participation.objects.create(event=old, user=user, scanne_at=timezone.now() if user.email != 'issa@test.ci' else None)
        self.stdout.write(self.style.SUCCESS(f'Comptes de démonstration : admin@test.ci, awa@test.ci, moussa@test.ci (agent), issa@test.ci — mot de passe : {password}'))
