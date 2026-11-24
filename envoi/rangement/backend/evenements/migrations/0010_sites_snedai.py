from django.db import migrations

# Les vrais sites : on enlève les lieux de départ qui ne servent à aucun événement, puis on ajoute Angré, Djibi, Yopougon.
A_ENLEVER = [
    "Centre d'enrôlement - Mairie d'Abobo", "Centre d'enrôlement - Mairie d'Adjamé", "Centre d'enrôlement - Mairie d'Attécoubé",
    "Centre d'enrôlement - Mairie de Cocody", "Centre d'enrôlement - Mairie de Koumassi", "Centre d'enrôlement - Mairie de Marcory",
    "Centre d'enrôlement - Mairie du Plateau", "Centre d'enrôlement - Mairie de Port-Bouët", "Centre d'enrôlement - Mairie de Treichville",
    "Centre d'enrôlement - Mairie de Yopougon", "Centre d'enrôlement - Mairie de Bingerville", "Centre d'enrôlement - Mairie de Songon",
]
A_AJOUTER = ["Siège du Groupe SNEDAI", "Angré", "Djibi", "Yopougon"]


def mettre_a_jour(apps, schema_editor):
    Lieu = apps.get_model("evenements", "Lieu")
    for nom in A_ENLEVER:
        for lieu in Lieu.objects.filter(nom__iexact=nom):
            if not lieu.evenements.exists():
                lieu.delete()
    for nom in A_AJOUTER:
        if not Lieu.objects.filter(nom__iexact=nom).exists():
            Lieu.objects.create(nom=nom)


class Migration(migrations.Migration):
    dependencies = [("evenements", "0009_lieux_de_depart")]
    operations = [migrations.RunPython(mettre_a_jour, migrations.RunPython.noop)]
