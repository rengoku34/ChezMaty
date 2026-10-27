"""
Les VUES du BACKOFFICE, réservées à l'administrateur (@admin_required) :
  - le CRUD des événements : Create (créer), Read (lister / voir), Update (modifier), Delete (supprimer) ;
  - la liste des inscriptions de chaque événement, et son export Excel ;
  - la gestion des agents de scan.
"""
import re
import unicodedata

from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods, require_POST

from ..models import Event, Inscription, User
from ..security import admin_required
from ..services import queries
from ..services.excel import build_inscriptions_workbook
from ..services.mailer import get_mailer
from ..services.validation import EMAIL_RE, clean
from .outils import charger_evenement

HORAIRE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$')    # le format du champ « date et heure » du navigateur


# ---------------------------------------------------------------------------
# READ : la liste des événements
# ---------------------------------------------------------------------------
@admin_required
def liste_evenements(request):
    return render(request, 'admin_site/evenements.html', {'title': 'Événements', 'events': queries.liste_evenements()})


# ---------------------------------------------------------------------------
# CREATE et UPDATE : le formulaire d'un événement
# ---------------------------------------------------------------------------
def lire_formulaire_evenement(request):
    """Lit les champs du formulaire et les vérifie. Renvoie (valeurs, erreur)."""
    valeurs = {
        'titre': clean(request.POST.get('titre'), 150),
        'description': clean(request.POST.get('description'), 5000),
        'lieu': clean(request.POST.get('lieu'), 200),
        'debut': clean(request.POST.get('debut'), 16),
        'fin': clean(request.POST.get('fin'), 16),
    }
    erreur = None
    if not valeurs['titre'] or not valeurs['description']:
        erreur = 'Le nom et la description sont obligatoires.'
    elif (valeurs['debut'] and not HORAIRE.match(valeurs['debut'])) or (valeurs['fin'] and not HORAIRE.match(valeurs['fin'])):
        erreur = 'Horaires invalides.'
    elif valeurs['fin'] and not valeurs['debut']:
        erreur = 'Indiquez l’heure de début avant l’heure de fin.'
    elif valeurs['debut'] and valeurs['fin'] and valeurs['fin'] < valeurs['debut']:
        # Ces textes « 2026-12-20T09:00 » se comparent correctement comme du texte (année, mois, jour, heure…).
        erreur = 'La fin doit être après le début.'
    return valeurs, erreur


def afficher_formulaire_evenement(request, event, valeurs, erreur=None, status=200):
    """Affiche le formulaire : vide pour une création, pré-rempli pour une modification."""
    return render(request, 'admin_site/event_form.html', {
        'title': 'Modifier l’événement' if event else 'Créer un événement',
        'event': event, 'values': valeurs, 'error': erreur,
    }, status=status)


@admin_required
def nouvel_evenement(request):
    """GET /admin/evenements/nouveau : le formulaire vide."""
    return afficher_formulaire_evenement(request, None, {})


@require_POST
@admin_required
def creer_evenement(request):
    """POST /admin/evenements : CREATE. Enregistre le nouvel événement et son lien d'inscription."""
    valeurs, erreur = lire_formulaire_evenement(request)
    if erreur:
        return afficher_formulaire_evenement(request, None, valeurs, erreur, 400)
    event = Event.objects.create(**valeurs)
    messages.success(request, 'Événement créé. Copiez son lien d’inscription et partagez-le aux employés.')
    return redirect(f'/admin/evenements/{event.id}')


@require_http_methods(['GET', 'POST'])
@admin_required
@charger_evenement
def modifier_evenement(request, event):
    """UPDATE : modifier un événement. Le lien d'inscription et les billets déjà délivrés restent valables."""
    if request.method == 'GET':
        return afficher_formulaire_evenement(request, event, event)
    valeurs, erreur = lire_formulaire_evenement(request)
    if erreur:
        return afficher_formulaire_evenement(request, event, valeurs, erreur, 400)
    for champ, valeur in valeurs.items():
        setattr(event, champ, valeur)
    event.save()
    messages.success(request, 'Événement modifié.')
    return redirect(f'/admin/evenements/{event.id}')


@require_POST
@admin_required
@charger_evenement
def supprimer_evenement(request, event):
    """DELETE : supprime l'événement ET toutes ses inscriptions (le bouton demande une confirmation)."""
    nombre = event.inscriptions.count()
    event.delete()
    messages.success(request, f'« {event.titre} » a été supprimé ({nombre} inscription(s) effacée(s)).')
    return redirect('/admin/evenements')


# ---------------------------------------------------------------------------
# READ : un événement avec la liste de ses inscriptions
# ---------------------------------------------------------------------------
@admin_required
@charger_evenement
def detail_evenement(request, event):
    """La liste des inscriptions de l'événement, avec la colonne « Présent » (vrai ou faux)."""
    inscriptions = list(event.inscriptions.all())
    presents = sum(1 for i in inscriptions if i.present)
    return render(request, 'admin_site/event_detail.html', {
        'title': event.titre, 'event': event, 'inscriptions': inscriptions,
        'nb_inscrits': len(inscriptions), 'nb_presents': presents,
        'taux': round(presents / len(inscriptions) * 100) if inscriptions else None,
    })


@admin_required
@charger_evenement
def export_excel(request, event):
    """Télécharge la liste des inscriptions en fichier Excel."""
    donnees = build_inscriptions_workbook(event, list(event.inscriptions.all()))
    # Un nom de fichier propre à partir du titre : sans accents ni espaces (« Soirée 2026 » -> « Soiree-2026 »).
    sans_accents = unicodedata.normalize('NFD', event.titre).encode('ascii', 'ignore').decode()
    nom = re.sub(r'^-|-$', '', re.sub(r'[^\w]+', '-', sans_accents))[:50] or 'evenement'
    reponse = HttpResponse(donnees, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reponse.headers['Content-Disposition'] = f'attachment; filename="inscriptions-{nom}.xlsx"'
    return reponse


@require_POST
@admin_required
@charger_evenement
def supprimer_inscription(request, event, inscription_id):
    """Supprime une inscription (par exemple une inscription faite par erreur)."""
    inscription = Inscription.objects.filter(pk=inscription_id, event=event).first()
    if inscription:
        inscription.delete()
        messages.success(request, f'L’inscription de {inscription.prenom} {inscription.nom} a été supprimée.')
    return redirect(f'/admin/evenements/{event.id}')


# ---------------------------------------------------------------------------
# Les agents de scan
# ---------------------------------------------------------------------------
@require_http_methods(['GET', 'POST'])
@admin_required
def agents(request):
    """La liste des agents de scan, et le formulaire pour en ajouter un. Un agent peut SEULEMENT scanner."""
    erreur, valeurs = None, {}
    if request.method == 'POST':
        valeurs = {c: clean(request.POST.get(c), 200 if c == 'email' else 100) for c in ('nom', 'prenom', 'email')}
        valeurs['email'] = valeurs['email'].lower()
        mot_de_passe = str(request.POST.get('password') or '')
        if not valeurs['nom'] or not valeurs['prenom']:
            erreur = 'Merci de remplir le nom et le prénom.'
        elif not EMAIL_RE.match(valeurs['email']):
            erreur = 'Adresse e-mail invalide.'
        elif len(mot_de_passe) < 8:
            erreur = 'Le mot de passe doit contenir au moins 8 caractères.'
        elif User.objects.par_email(valeurs['email']):
            erreur = 'Un compte existe déjà avec cette adresse.'
        if not erreur:
            User.objects.create_user(valeurs['email'], mot_de_passe, nom=valeurs['nom'], prenom=valeurs['prenom'], is_agent=True)
            messages.success(request, f'L’agent {valeurs["prenom"]} {valeurs["nom"]} a été créé. Il peut se connecter pour scanner.')
            return redirect('/admin/agents')
    mailer = get_mailer()
    return render(request, 'admin_site/agents.html', {
        'title': 'Agents de scan', 'users': User.objects.all(), 'error': erreur, 'values': valeurs,
        # État du service d'e-mails : le service utilisé, l'expéditeur, et la dernière panne éventuelle.
        'mail': {'provider': mailer.provider, 'sender': mailer.sender, **mailer.state},
    }, status=400 if erreur else 200)


@require_POST
@admin_required
def supprimer_agent(request, user_id):
    """Supprime un agent. Le compte administrateur ne peut jamais être supprimé."""
    utilisateur = User.objects.filter(pk=user_id).first()
    if not utilisateur:
        return redirect('/admin/agents')
    if utilisateur.is_admin:
        messages.error(request, 'Le compte administrateur ne peut pas être supprimé.')
        return redirect('/admin/agents')
    utilisateur.delete()
    messages.success(request, f'Le compte de {utilisateur.prenom} {utilisateur.nom} a été supprimé.')
    return redirect('/admin/agents')


@require_POST
@admin_required
def tester_email(request):
    """Bouton « Envoyer un e-mail de test » : écrit à l'administrateur et affiche l'erreur exacte si ça échoue."""
    mailer = get_mailer()
    resultat = mailer.send_test(request.user.email)
    if resultat['ok']:
        messages.success(request, f'E-mail de test envoyé à {request.user.email} depuis {mailer.sender}. Regardez aussi dans les « Spams ».')
    else:
        messages.error(request, f'L’e-mail n’est pas parti. Erreur : {resultat["error"]}')
    return redirect('/admin/agents')
