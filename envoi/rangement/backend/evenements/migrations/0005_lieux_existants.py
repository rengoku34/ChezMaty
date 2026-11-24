from django.db import migrations


def creer_les_lieux(apps, schema_editor):
    """Étape 2 sur 3 : chaque lieu déjà saisi dans un événement devient un vrai lieu (« Salle A » et « salle  a » ne font qu'un)."""
    Evenement = apps.get_model("evenements", "Evenement")
    Lieu = apps.get_model("evenements", "Lieu")
    for evenement in Evenement.objects.order_by("id"):          # le premier écrit donne son orthographe au lieu
        nom = " ".join((evenement.lieu or "").split()) or "Lieu non précisé"
        lieu = Lieu.objects.filter(nom__iexact=nom).first() or Lieu.objects.create(nom=nom)
        evenement.lieu_ref = lieu
        evenement.save(update_fields=["lieu_ref"])


def remettre_les_noms(apps, schema_editor):
    Evenement = apps.get_model("evenements", "Evenement")
    for evenement in Evenement.objects.select_related("lieu_ref"):
        if evenement.lieu_ref_id:
            evenement.lieu = evenement.lieu_ref.nom
            evenement.save(update_fields=["lieu"])


class Migration(migrations.Migration):
    dependencies = [("evenements", "0004_lieu")]

    operations = [migrations.RunPython(creer_les_lieux, remettre_les_noms)]
