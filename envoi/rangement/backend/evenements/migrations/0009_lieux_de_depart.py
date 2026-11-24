from django.db import migrations

# Une liste de départ (à corriger dans l'administration Django si besoin). Les lieux déjà présents ne sont pas touchés.
LIEUX = [
    "Siège du Groupe SNEDAI",
    "Centre d'enrôlement - Mairie d'Abobo", "Centre d'enrôlement - Mairie d'Adjamé", "Centre d'enrôlement - Mairie d'Attécoubé",
    "Centre d'enrôlement - Mairie de Cocody", "Centre d'enrôlement - Mairie de Koumassi", "Centre d'enrôlement - Mairie de Marcory",
    "Centre d'enrôlement - Mairie du Plateau", "Centre d'enrôlement - Mairie de Port-Bouët", "Centre d'enrôlement - Mairie de Treichville",
    "Centre d'enrôlement - Mairie de Yopougon", "Centre d'enrôlement - Mairie de Bingerville", "Centre d'enrôlement - Mairie de Songon",
]


def ajouter(apps, schema_editor):
    Lieu = apps.get_model("evenements", "Lieu")
    for nom in LIEUX:
        if not Lieu.objects.filter(nom__iexact=nom).exists():
            Lieu.objects.create(nom=nom)


class Migration(migrations.Migration):
    dependencies = [("evenements", "0008_message_mis_en_forme")]
    operations = [migrations.RunPython(ajouter, migrations.RunPython.noop)]
