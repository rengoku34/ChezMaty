import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    """Deux champs facultatifs sur les événements : la date limite d'inscription et le nombre de places."""

    dependencies = [("evenements", "0006_lieu_obligatoire")]

    operations = [
        migrations.AddField(
            model_name="evenement",
            name="inscriptions_jusqu_au",
            field=models.DateTimeField(blank=True, null=True, verbose_name="date limite d'inscription",
                                       help_text="Facultatif. Sans date limite, on peut s'inscrire jusqu'à la fin de l'événement."),
        ),
        migrations.AddField(
            model_name="evenement",
            name="places",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="nombre de places",
                                              validators=[django.core.validators.MinValueValidator(1)],
                                              help_text="Facultatif. Sans nombre, les places ne sont pas limitées."),
        ),
    ]
