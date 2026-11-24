from django.apps import AppConfig


class EvenementsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "evenements"
    verbose_name = "Participations"       # le titre affiché dans l'administration (au-dessus des inscriptions)

    def ready(self):
        from django.contrib.auth import get_user_model
        from django.db.models.signals import pre_save
        from rest_framework.authtoken.models import Token

        def fermer_les_sessions_si_mot_de_passe_change(sender, instance, **kwargs):
            """Quand le mot de passe d'un compte change, ses jetons sont supprimés : le Zebra ou le navigateur déjà connectés
            doivent se reconnecter avec le nouveau mot de passe."""
            if not instance.pk:
                return
            ancien = sender.objects.filter(pk=instance.pk).values_list("password", flat=True).first()
            if ancien is not None and ancien != instance.password:
                Token.objects.filter(user_id=instance.pk).delete()

        pre_save.connect(fermer_les_sessions_si_mot_de_passe_change, sender=get_user_model(), weak=False,
                         dispatch_uid="fermer_sessions_mot_de_passe")
