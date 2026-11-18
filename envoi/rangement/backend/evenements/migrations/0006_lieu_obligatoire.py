from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Étape 3 sur 3 : l'ancien champ texte disparaît, le lieu choisi devient obligatoire."""

    dependencies = [("evenements", "0005_lieux_existants")]

    operations = [
        # (une valeur par défaut sur l'ancien champ rend le retour en arrière possible : l'étape précédente remet ensuite les noms)
        migrations.AlterField(model_name="evenement", name="lieu", field=models.CharField(max_length=200, default="")),
        migrations.RemoveField(model_name="evenement", name="lieu"),
        migrations.RenameField(model_name="evenement", old_name="lieu_ref", new_name="lieu"),
        migrations.AlterField(
            model_name="evenement",
            name="lieu",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="evenements", to="evenements.lieu"),
        ),
    ]
