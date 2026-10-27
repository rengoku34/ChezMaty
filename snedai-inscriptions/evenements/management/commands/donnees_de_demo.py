"""
Crée des données de démonstration pour essayer le site chez soi : un administrateur, un agent, deux événements
et quelques inscriptions. À utiliser seulement en local : python manage.py donnees_de_demo
"""
from datetime import datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from evenements.models import Event, Inscription, User


class Command(BaseCommand):
    help = 'Crée des comptes, des événements et des inscriptions de démonstration (essais en local uniquement).'

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Cette commande est réservée aux essais en local (DJANGO_DEBUG=1).')
        mot_de_passe = 'motdepasse1'
        for email, nom, prenom, agent in (('admin@test.ci', 'Nabaloum', 'Aboubakar', False), ('moussa@test.ci', 'Traore', 'Moussa', True)):
            if not User.objects.par_email(email):
                User.objects.create_user(email, mot_de_passe, nom=nom, prenom=prenom, is_agent=agent)
        if Event.objects.exists():
            self.stdout.write('Des événements existent déjà : rien à ajouter.')
            return
        dans_18_jours = datetime.now() + timedelta(days=18)
        bienetre = Event.objects.create(
            titre='Journée bien-être SNEDAI', lieu='Siège SNEDAI, Abidjan',
            description='Une journée pour prendre soin de soi : ateliers sport et nutrition, repas partagé et activités d’équipe.',
            debut=dans_18_jours.strftime('%Y-%m-%dT09:00'), fin=dans_18_jours.strftime('%Y-%m-%dT16:00'))
        Event.objects.create(
            titre='Séminaire de rentrée', lieu='Salle de conférence',
            description='Présentation des objectifs de l’année et des nouveaux projets.',
            debut='2026-01-20T09:00', fin='2026-01-20T12:00')
        gens = [('Kone', 'Awa', 'SNEDAI Telecom', '07 07 11 22 33'), ('Diallo', 'Issa', 'SNEDAI', '05 44 55 66 77'),
                ('Traore', 'Fatou', 'SNEDAI Distribution', '01 02 03 04 05'), ('Yao', 'Marc', 'SNEDAI', '07 88 99 00 11'),
                ('Bamba', 'Koffi', 'SNEDAI Telecom', '05 12 34 56 78')]
        for index, (nom, prenom, filiale, telephone) in enumerate(gens):
            Inscription.objects.create(event=bienetre, nom=nom, prenom=prenom, filiale=filiale, telephone=telephone,
                                       email=f'{prenom.lower()}.{nom.lower()}@exemple.ci', present=index < 2,
                                       scanne_at=timezone.now() if index < 2 else None)
        self.stdout.write(self.style.SUCCESS(f'Prêt. Administrateur : admin@test.ci · Agent : moussa@test.ci · mot de passe : {mot_de_passe}'))
