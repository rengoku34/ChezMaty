from django.db import migrations, models
import django.db.models.deletion
import django.db.models.functions.text


class Migration(migrations.Migration):
    """Étape 1 sur 3 : la table des lieux, et un champ provisoire dans les événements."""

    dependencies = [("evenements", "0003_groupe_agents_de_scan")]

    operations = [
        migrations.CreateModel(
            name="Lieu",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom", models.CharField(max_length=200)),
            ],
            options={"verbose_name": "lieu", "verbose_name_plural": "lieux", "ordering": ["nom"]},
        ),
        migrations.AddConstraint(
            model_name="lieu",
            constraint=models.UniqueConstraint(django.db.models.functions.text.Lower("nom"), name="un_seul_lieu_par_nom"),
        ),
        migrations.AddField(
            model_name="evenement",
            name="lieu_ref",
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="evenements.lieu"),
        ),
    ]
