// ignore_for_file: deprecated_member_use, unnecessary_import
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:snedai_scan/api.dart';

http.Response json(int statut, Map<String, dynamic> corps) =>
    http.Response(jsonEncode(corps), statut, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  test("l'adresse du serveur : port 8000 par défaut, port respecté s'il est donné", () {
    expect(urlServeur('172.30.13.3'), 'http://172.30.13.3:8000');
    expect(urlServeur('10.0.0.5:8080'), 'http://10.0.0.5:8080');
  });

  test("l'adresse saisie est nettoyée", () {
    expect(nettoyerAdresse('  http://172.30.13.3/scan  '), '172.30.13.3');
    expect(nettoyerAdresse('https://serveur.snedai.ci:8000/mobile/'), 'serveur.snedai.ci:8000');
    expect(nettoyerAdresse(null), '');
    expect(nettoyerAdresse('   '), '');
  });

  group('ping : reconnaître le serveur SNEDAI', () {
    test('le bon serveur répond', () async {
      final api = Api(hote: '10.0.0.5', client: MockClient((r) async {
        expect(r.url.toString(), 'http://10.0.0.5:8000/api/ping/');
        return json(200, {'application': 'snedai-evenements'});
      }));
      expect(await api.ping(), isTrue);
    });
    test("un autre serveur, une erreur ou une panne : faux", () async {
      expect(await Api(hote: 'a', client: MockClient((r) async => json(200, {'application': 'autre'}))).ping(), isFalse);
      expect(await Api(hote: 'a', client: MockClient((r) async => json(404, {}))).ping(), isFalse);
      expect(await Api(hote: 'a', client: MockClient((r) async => throw const SocketException('refusé'))).ping(), isFalse);
    });
  });

  group('connexion', () {
    test("envoie l'identifiant sans espaces parasites et garde le jeton", () async {
      late Map<String, dynamic> recu;
      final api = Api(hote: 'h', client: MockClient((r) async {
        recu = jsonDecode(r.body) as Map<String, dynamic>;
        expect(r.url.path, '/api/auth/token/');
        return json(200, {'token': 'abc123'});
      }));
      final jeton = await api.connexion('  agent1 ', 'secret');
      expect(jeton, 'abc123');
      expect(api.jeton, 'abc123');
      expect(recu, {'username': 'agent1', 'password': 'secret'});
    });
    test('mauvais identifiants : message clair', () async {
      final api = Api(hote: 'h', client: MockClient((r) async => json(400, {'non_field_errors': ['x']})));
      expect(() => api.connexion('a', 'b'), throwsA(isA<ErreurApi>().having((e) => e.message, 'message', 'Identifiant ou mot de passe incorrect.')));
    });
    test('trop de tentatives (429)', () async {
      final api = Api(hote: 'h', client: MockClient((r) async => json(429, {'detail': 'throttled'})));
      expect(() => api.connexion('a', 'b'), throwsA(isA<ErreurApi>().having((e) => e.statut, 'statut', 429)));
    });
    test('serveur injoignable : statut 0', () async {
      final api = Api(hote: 'h', client: MockClient((r) async => throw const SocketException('pas de réseau')));
      expect(() => api.connexion('a', 'b'), throwsA(isA<ErreurApi>().having((e) => e.statut, 'statut', 0)));
    });
  });

  group('moi', () {
    test('lit le nom et le rôle, et envoie le jeton', () async {
      final api = Api(hote: 'h', jeton: 'abc', client: MockClient((r) async {
        expect(r.headers['Authorization'], 'Token abc');
        return json(200, {'username': 'agent1', 'role': 'agent'});
      }));
      final moi = await api.moi();
      expect(moi.identifiant, 'agent1');
      expect(moi.peutScanner, isTrue);
    });
    test("un compte « aucun » ne peut pas scanner", () async {
      final moi = await Api(hote: 'h', jeton: 'x', client: MockClient((r) async => json(200, {'username': 'u', 'role': 'aucun'}))).moi();
      expect(moi.peutScanner, isFalse);
    });
    test('jeton périmé : 401', () async {
      final api = Api(hote: 'h', jeton: 'x', client: MockClient((r) async => json(401, {'detail': 'x'})));
      expect(() => api.moi(), throwsA(isA<ErreurApi>().having((e) => e.statut, 'statut', 401)));
    });
  });

  group('scanner', () {
    final personne = {'nom': 'Zongo', 'prenom': 'Awa', 'filiale': 'STL', 'evenement': 'Conférence', 'creneau': '09:00-10:00'};

    test('200 : présence validée, avec la personne', () async {
      final api = Api(hote: 'h', jeton: 'x', client: MockClient((r) async {
        expect(jsonDecode(r.body), {'code': 'CODE'});
        return json(200, {'statut': 'present', 'message': 'Présence confirmée.', 'personne': personne});
      }));
      final reponse = await api.scanner('CODE');
      expect(reponse.statut, 'present');
      expect(reponse.personne!.nomComplet, 'Awa Zongo');
      expect(reponse.personne!.filiale, 'STL');
    });
    test('409 : déjà scanné, avec le message du serveur', () async {
      final api = Api(hote: 'h', jeton: 'x', client: MockClient((r) async => json(409, {'statut': 'deja', 'message': 'Déjà scanné le 10/12/2026 à 09:05.', 'personne': personne})));
      final reponse = await api.scanner('CODE');
      expect(reponse.statut, 'deja');
      expect(reponse.message, contains('09:05'));
    });
    test('404 : code inconnu, sans personne', () async {
      final api = Api(hote: 'h', jeton: 'x', client: MockClient((r) async => json(404, {'statut': 'inconnu', 'message': 'QR code inconnu ou invalide.'})));
      final reponse = await api.scanner('CODE');
      expect(reponse.statut, 'inconnu');
      expect(reponse.personne, isNull);
    });
    test('403 accès refusé, 401 session expirée, 500 erreur', () async {
      expect(() => Api(hote: 'h', client: MockClient((r) async => json(403, {}))).scanner('c'), throwsA(isA<ErreurApi>().having((e) => e.message, 'message', 'Accès refusé')));
      expect(() => Api(hote: 'h', client: MockClient((r) async => json(401, {}))).scanner('c'), throwsA(isA<ErreurApi>().having((e) => e.statut, 'statut', 401)));
      expect(() => Api(hote: 'h', client: MockClient((r) async => http.Response('boom', 500))).scanner('c'), throwsA(isA<ErreurApi>().having((e) => e.statut, 'statut', 500)));
    });
  });

  test('déconnexion : le jeton est oublié même sans réseau', () async {
    final api = Api(hote: 'h', jeton: 'x', client: MockClient((r) async => throw const SocketException('coupé')));
    await api.deconnexion();
    expect(api.jeton, isNull);
  });
}
