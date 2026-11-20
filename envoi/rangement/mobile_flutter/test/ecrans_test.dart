// ignore_for_file: deprecated_member_use, unnecessary_import
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:snedai_scan/api.dart';
import 'package:snedai_scan/depot.dart';
import 'package:snedai_scan/ecrans.dart';
import 'package:snedai_scan/main.dart';
import 'package:snedai_scan/son.dart';

class FausseSonnerie implements Sonnerie {
  final List<bool> appels = [];

  @override
  Future<void> jouer({required bool ok}) async => appels.add(ok);
}

class FauxService implements ServiceScan {
  FauxService(this.reponses);

  final List<Object> reponses;
  final List<String> codes = [];

  @override
  Future<ReponseScan> scanner(String code) async {
    codes.add(code);
    final r = reponses.removeAt(0);
    if (r is ErreurApi) throw r;
    return r as ReponseScan;
  }
}

const personne = Personne(nom: 'Zongo', prenom: 'Awa', filiale: 'STL', evenement: 'Conférence Octobre Rose', creneau: '09:00-10:00');
final code1 = 'A' * 32;
final code2 = 'B' * 32;
final code3 = 'C' * 32;

http.Response json(int statut, Map<String, dynamic> corps) => http.Response(jsonEncode(corps), statut, headers: {'content-type': 'application/json'});

Future<void> scanner(WidgetTester tester, String code) async {
  await tester.enterText(find.byKey(const Key('champ-lecteur')), code);
  await tester.testTextInput.receiveAction(TextInputAction.done);          // le lecteur « tape » le code puis Entrée
  await tester.pump();
  await tester.pump();
}

void main() {
  group("l'écran de scan", () {
    StreamController<String>? lecteurFaux;
    var configurations = 0;

    Future<(FauxService, FausseSonnerie, List<String>)> ouvrir(WidgetTester tester, List<Object> reponses) async {
      configurations = 0;
      lecteurFaux = StreamController<String>();
      final service = FauxService(reponses);
      final sonnerie = FausseSonnerie();
      final evenements = <String>[];
      await tester.pumpWidget(MaterialApp(
        home: EcranScan(
          service: service,
          sonnerie: sonnerie,
          identifiant: 'agent1',
          onDeconnexion: () => evenements.add('deconnexion'),
          onSessionExpiree: () => evenements.add('session'),
          onReseauPerdu: () => evenements.add('reseau'),
          lecteur: lecteurFaux?.stream ?? const Stream<String>.empty(),
          configurerLecteur: () async { configurations++; },
        ),
      ));
      await tester.pump();
      return (service, sonnerie, evenements);
    }

    Color couleurCarte(WidgetTester tester) => ((tester.widget<AnimatedContainer>(find.byKey(const Key('carte-etat'))).decoration) as BoxDecoration).color!;

    testWidgets("lecteur Zebra (DataWedge) : le code reçu par message est envoyé à l'API, écran vert, bip, et la ligne de diagnostic le dit", (tester) async {
      final (service, sonnerie, _) = await ouvrir(tester, [const ReponseScan(statut: 'present', message: 'Présence confirmée.', personne: personne)]);
      expect(configurations, 1);                                         // le profil DataWedge est configuré à l'ouverture de l'écran
      expect(find.text("Lecteur : en attente d'un code"), findsOneWidget);
      lecteurFaux!.add(code1);                                           // DataWedge envoie le code lu
      await tester.pump();
      await tester.pump();
      expect(service.codes, [code1]);
      expect(find.text('Présence validée'), findsOneWidget);
      expect(sonnerie.appels, [true]);
      expect(find.textContaining('Code reçu à'), findsOneWidget);
      expect(find.textContaining('(32 caractères)'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets("lecteur Zebra : un code vide ou avec des espaces autour est nettoyé, deux codes différents donnent deux scans", (tester) async {
      final (service, _, _) = await ouvrir(tester, [
        const ReponseScan(statut: 'present', message: '', personne: personne),
        const ReponseScan(statut: 'deja', message: '', personne: personne),
      ]);
      lecteurFaux!.add('   ');
      await tester.pump();
      expect(service.codes, isEmpty);
      lecteurFaux!.add('  $code1\n');
      await tester.pump();
      await tester.pump();
      lecteurFaux!.add(code2);
      await tester.pump();
      await tester.pump();
      expect(service.codes, [code1, code2]);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets("lecteur Zebra : une erreur du lecteur ne fait pas planter l'écran", (tester) async {
      await ouvrir(tester, []);
      lecteurFaux!.addError('lecteur indisponible');
      await tester.pump();
      expect(find.text('Prêt à scanner'), findsOneWidget);
    });

    testWidgets("au départ : « Prêt à scanner », le nom de l'agent est affiché", (tester) async {
      await ouvrir(tester, []);
      expect(find.text('Prêt à scanner'), findsOneWidget);
      expect(find.text('agent1'), findsOneWidget);
      expect(find.text('Déconnexion'), findsOneWidget);
    });

    testWidgets("premier scan : écran VERT « Présence validée », le nom, la filiale et l'événement, et le bip de réussite", (tester) async {
      final (service, sonnerie, _) = await ouvrir(tester, [const ReponseScan(statut: 'present', message: 'Présence confirmée.', personne: personne)]);
      await scanner(tester, code1);
      expect(service.codes, [code1]);
      expect(find.text('Présence validée'), findsOneWidget);
      expect(find.textContaining('Awa Zongo · STL'), findsWidgets);
      expect(find.textContaining('Conférence Octobre Rose'), findsOneWidget);
      expect(couleurCarte(tester), const Color(0xFF1E8E3E));
      expect(sonnerie.appels, [true]);
      expect(find.text('✔'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));            // laisse le minuteur se terminer
    });

    testWidgets("deuxième scan : écran ORANGE « Déjà scanné » avec l'heure du premier scan, et le bip d'erreur", (tester) async {
      final (_, sonnerie, _) = await ouvrir(tester, [const ReponseScan(statut: 'deja', message: 'Déjà scanné le 10/12/2026 à 09:05.', personne: personne)]);
      await scanner(tester, code2);
      expect(find.text('Déjà scanné'), findsOneWidget);
      expect(find.textContaining('09:05'), findsOneWidget);
      expect(couleurCarte(tester), const Color(0xFFE8710A));
      expect(sonnerie.appels, [false]);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets("code inexistant : écran ROUGE « Inconnu »", (tester) async {
      await ouvrir(tester, [const ReponseScan(statut: 'inconnu', message: 'QR code inconnu ou invalide.')]);
      await scanner(tester, code3);
      expect(find.text('Inconnu'), findsWidgets);
      expect(find.text('QR code non reconnu'), findsOneWidget);
      expect(couleurCarte(tester), const Color(0xFFC62828));
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets("après 4 secondes l'écran redevient « Prêt à scanner »", (tester) async {
      await ouvrir(tester, [const ReponseScan(statut: 'present', message: '', personne: personne)]);
      await scanner(tester, code1);
      expect(find.text('Présence validée'), findsOneWidget);
      await tester.pump(const Duration(seconds: 4, milliseconds: 100));
      expect(find.text('Prêt à scanner'), findsOneWidget);
      expect(couleurCarte(tester), const Color(0xFF3B4A6B));
    });

    testWidgets("le même code scanné deux fois de suite en moins de 3 secondes n'est envoyé qu'une fois", (tester) async {
      final (service, _, _) = await ouvrir(tester, [const ReponseScan(statut: 'present', message: '', personne: personne), const ReponseScan(statut: 'deja', message: '', personne: personne)]);
      await scanner(tester, code1);
      await scanner(tester, code1);
      expect(service.codes.length, 1);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets("l'historique garde les scans, le plus récent en premier", (tester) async {
      await ouvrir(tester, [
        const ReponseScan(statut: 'present', message: '', personne: personne),
        const ReponseScan(statut: 'inconnu', message: ''),
      ]);
      await scanner(tester, code1);
      await scanner(tester, code2);
      expect(find.textContaining('Awa Zongo · Présence validée'), findsOneWidget);
      expect(find.textContaining('Inconnu · Inconnu'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('session expirée (401) : on prévient l\'application, sans afficher de scan', (tester) async {
      final (_, _, evenements) = await ouvrir(tester, [ErreurApi(401, 'Session expirée')]);
      await scanner(tester, code1);
      expect(evenements, ['session']);
    });

    testWidgets("serveur injoignable (réseau perdu) : message rouge, et l'application relance la recherche du serveur", (tester) async {
      final (_, _, evenements) = await ouvrir(tester, [ErreurApi(0, 'Connexion impossible. Vérifiez le réseau.')]);
      await scanner(tester, code1);
      expect(find.textContaining('Connexion impossible'), findsOneWidget);
      expect(evenements, ['reseau']);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('« Déconnexion » prévient l\'application', (tester) async {
      final (_, _, evenements) = await ouvrir(tester, []);
      await tester.tap(find.byKey(const Key('bouton-deconnexion')));
      expect(evenements, ['deconnexion']);
    });

    testWidgets("un code de moins de 32 caractères tapé sans Entrée n'est pas envoyé trop tôt", (tester) async {
      final (service, _, _) = await ouvrir(tester, [const ReponseScan(statut: 'present', message: '', personne: personne)]);
      await tester.enterText(find.byKey(const Key('champ-lecteur')), 'ABC');
      await tester.pump(const Duration(seconds: 1));
      expect(service.codes, isEmpty);
    });

    testWidgets("un lecteur sans touche Entrée : le code complet (32 caractères) est envoyé tout seul après un court silence", (tester) async {
      final (service, _, _) = await ouvrir(tester, [const ReponseScan(statut: 'present', message: '', personne: personne)]);
      await tester.enterText(find.byKey(const Key('champ-lecteur')), code1);
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      expect(service.codes, [code1]);
      expect(find.text('Présence validée'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
    });
  });

  group("l'application complète (recherche du serveur, connexion, scan)", () {
    /// Un faux serveur SNEDAI : /api/ping/, connexion (agent1 / bon), moi, scan.
    MockClient fauxServeur({List<String>? journal}) => MockClient((r) async {
          journal?.add('${r.method} ${r.url.path}');
          switch (r.url.path) {
            case '/api/ping/':
              return json(200, {'application': 'snedai-evenements'});
            case '/api/auth/token/':
              final corps = jsonDecode(r.body) as Map<String, dynamic>;
              return corps['username'] == 'agent1' && corps['password'] == 'bon' ? json(200, {'token': 'JETON'}) : json(400, {'non_field_errors': ['x']});
            case '/api/auth/moi/':
              if (r.headers['Authorization'] != 'Token JETON') return json(401, {'detail': 'x'});
              return json(200, {'username': 'agent1', 'role': 'agent'});
            case '/api/scan/':
              return json(200, {'statut': 'present', 'message': 'Présence confirmée.', 'personne': {'nom': 'Zongo', 'prenom': 'Awa', 'filiale': 'STL', 'evenement': 'Conférence', 'creneau': ''}});
            case '/api/auth/deconnexion/':
              return http.Response('', 204);
          }
          return json(404, {});
        });

    Services services({DepotMemoire? depot, String? trouve = '10.0.0.5', MockClient? client, List<String>? recherches}) => Services(
          depot: depot ?? DepotMemoire(),
          sonnerie: FausseSonnerie(),
          trouver: (derniere) async {
            recherches?.add(derniere ?? '');
            return trouve;
          },
          creerApi: (hote, jeton) => Api(hote: hote, jeton: jeton, client: client ?? fauxServeur()),
          dureeLogo: Duration.zero,
        );

    testWidgets("première ouverture : le serveur est trouvé tout seul, puis l'écran de connexion s'affiche (aucune adresse à taper)", (tester) async {
      final depot = DepotMemoire();
      await tester.pumpWidget(AppSnedai(services: services(depot: depot)));
      expect(find.text('Recherche du serveur…'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.text('Scan des présences'), findsOneWidget);
      expect(find.text('Se connecter'), findsOneWidget);
      expect(depot.donnees[cleServeur], '10.0.0.5');            // l'adresse trouvée est mémorisée
    });

    testWidgets("connexion avec un espace parasite après l'identifiant : l'écran de scan s'ouvre, le jeton est mémorisé", (tester) async {
      final depot = DepotMemoire();
      await tester.pumpWidget(AppSnedai(services: services(depot: depot)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('champ-identifiant')), 'agent1 ');
      await tester.enterText(find.byKey(const Key('champ-mot-de-passe')), 'bon');
      await tester.tap(find.byKey(const Key('bouton-connexion')));
      await tester.pumpAndSettle();
      expect(find.text('Prêt à scanner'), findsOneWidget);
      expect(find.text('agent1'), findsOneWidget);
      expect(depot.donnees[cleJeton], 'JETON');
      expect(depot.donnees[cleNom], 'agent1');
    });

    testWidgets('mauvais mot de passe : message clair, on reste sur la connexion', (tester) async {
      await tester.pumpWidget(AppSnedai(services: services()));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('champ-identifiant')), 'agent1');
      await tester.enterText(find.byKey(const Key('champ-mot-de-passe')), 'faux');
      await tester.tap(find.byKey(const Key('bouton-connexion')));
      await tester.pumpAndSettle();
      expect(find.text('Identifiant ou mot de passe incorrect.'), findsOneWidget);
      expect(find.text('Se connecter'), findsOneWidget);
    });

    testWidgets("champs vides : on le dit, rien n'est envoyé", (tester) async {
      final journal = <String>[];
      await tester.pumpWidget(AppSnedai(services: services(client: fauxServeur(journal: journal))));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bouton-connexion')));
      await tester.pumpAndSettle();
      expect(find.text("Saisissez l'identifiant et le mot de passe."), findsOneWidget);
      expect(journal.where((e) => e.contains('token')), isEmpty);
    });

    testWidgets("jeton déjà enregistré et valable : on arrive directement sur l'écran de scan", (tester) async {
      final depot = DepotMemoire()..donnees[cleJeton] = 'JETON';
      await tester.pumpWidget(AppSnedai(services: services(depot: depot)));
      await tester.pumpAndSettle();
      expect(find.text('Prêt à scanner'), findsOneWidget);
    });

    testWidgets("jeton périmé : retour à la connexion avec « Session expirée »", (tester) async {
      final depot = DepotMemoire()..donnees[cleJeton] = 'VIEUX';
      await tester.pumpWidget(AppSnedai(services: services(depot: depot)));
      await tester.pumpAndSettle();
      expect(find.text('Session expirée : reconnectez-vous.'), findsOneWidget);
      expect(depot.donnees.containsKey(cleJeton), isFalse);
    });

    testWidgets('scan complet puis déconnexion (le jeton est supprimé)', (tester) async {
      final depot = DepotMemoire()..donnees[cleJeton] = 'JETON';
      final journal = <String>[];
      await tester.pumpWidget(AppSnedai(services: services(depot: depot, client: fauxServeur(journal: journal))));
      await tester.pumpAndSettle();
      await scanner(tester, code1);
      await tester.pump();
      expect(find.text('Présence validée'), findsOneWidget);
      expect(journal, contains('POST /api/scan/'));
      await tester.pump(const Duration(seconds: 5));
      await tester.tap(find.byKey(const Key('bouton-deconnexion')));
      await tester.pumpAndSettle();
      expect(find.text('Se connecter'), findsOneWidget);
      expect(depot.donnees.containsKey(cleJeton), isFalse);
      expect(journal, contains('POST /api/auth/deconnexion/'));
    });

    testWidgets("serveur introuvable : « Serveur injoignable », puis « Réessayer » retrouve le serveur", (tester) async {
      String? trouve;
      final depot = DepotMemoire()..donnees[cleServeur] = '172.30.12.140';
      final s = Services(
        depot: depot,
        sonnerie: FausseSonnerie(),
        trouver: (d) async => trouve,
        creerApi: (h, j) => Api(hote: h, jeton: j, client: fauxServeur()),
        dureeLogo: Duration.zero,
      );
      await tester.pumpWidget(AppSnedai(services: s));
      await tester.pumpAndSettle();
      expect(find.text('Serveur injoignable'), findsOneWidget);
      expect(find.text('Dernière adresse : 172.30.12.140'), findsOneWidget);
      trouve = '192.168.1.57';                                   // autre Wi-Fi : le serveur a une nouvelle adresse
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(find.text('Scan des présences'), findsOneWidget);
      expect(depot.donnees[cleServeur], '192.168.1.57');
    });

    testWidgets("la recherche part de la dernière adresse mémorisée", (tester) async {
      final recherches = <String>[];
      final depot = DepotMemoire()..donnees[cleServeur] = '172.30.12.140';
      await tester.pumpWidget(AppSnedai(services: services(depot: depot, trouve: '172.30.12.140', recherches: recherches)));
      await tester.pumpAndSettle();
      expect(recherches, ['172.30.12.140']);
    });

    testWidgets("en dernier recours : saisie manuelle de l'adresse, vérifiée auprès du serveur", (tester) async {
      await tester.pumpWidget(AppSnedai(services: services(trouve: null)));
      await tester.pumpAndSettle();
      await tester.tap(find.text("Changer l'adresse du serveur"));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, ' http://10.0.0.77/scan ');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();
      expect(find.text('Scan des présences'), findsOneWidget);
    });

    testWidgets("saisie manuelle d'une adresse où il n'y a pas de serveur SNEDAI : message clair", (tester) async {
      final s = Services(
        depot: DepotMemoire(),
        sonnerie: FausseSonnerie(),
        trouver: (d) async => null,
        creerApi: (h, j) => Api(hote: h, jeton: j, client: MockClient((r) async => json(404, {}))),
        dureeLogo: Duration.zero,
      );
      await tester.pumpWidget(AppSnedai(services: s));
      await tester.pumpAndSettle();
      await tester.tap(find.text("Changer l'adresse du serveur"));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, '10.9.9.9');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();
      expect(find.textContaining("Aucun serveur SNEDAI ne répond à l'adresse 10.9.9.9"), findsOneWidget);
    });

    testWidgets("un compte sans droit de scan est refusé et déconnecté", (tester) async {
      final client = MockClient((r) async {
        switch (r.url.path) {
          case '/api/auth/token/':
            return json(200, {'token': 'T'});
          case '/api/auth/moi/':
            return json(200, {'username': 'simple', 'role': 'aucun'});
        }
        return http.Response('', 204);
      });
      await tester.pumpWidget(AppSnedai(services: services(client: client)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('champ-identifiant')), 'simple');
      await tester.enterText(find.byKey(const Key('champ-mot-de-passe')), 'x');
      await tester.tap(find.byKey(const Key('bouton-connexion')));
      await tester.pumpAndSettle();
      expect(find.text("Ce compte n'a pas le droit de scanner."), findsOneWidget);
    });
  });
}
