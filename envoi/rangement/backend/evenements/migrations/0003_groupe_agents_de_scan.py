"""
Migration de DONNÉES : elle ne change pas les tables, elle ajoute une ligne :
le groupe d'utilisateurs « Agents de scan ».
"""
from django.db import migrations

NOM_GROUPE = "Agents de scan"


def creer_groupe(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.get_or_create(name=NOM_GROUPE)


def supprimer_groupe(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name=NOM_GROUPE).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("evenements", "0002_inscription"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(creer_groupe, supprimer_groupe),
    ]
