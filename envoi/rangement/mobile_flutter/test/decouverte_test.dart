// ignore_for_file: deprecated_member_use, unnecessary_import
import 'package:flutter_test/flutter_test.dart';
import 'package:snedai_scan/decouverte.dart';

void main() {
  group('les adresses à essayer', () {
    test("notre sous-réseau, son voisin direct (/23) et les deux suivants, sans notre propre adresse", () {
      final liste = candidats('172.30.13.3');
      expect(liste.length, 3 * 254 - 1);
      expect(liste.first, '172.30.13.1');                       // notre sous-réseau d'abord
      expect(liste, isNot(contains('172.30.13.3')));
      expect(liste, contains('172.30.12.102'));                  // le voisin : 172.30.12.x et 172.30.13.x forment un /23
      expect(liste, contains('172.30.14.7'));
      expect(liste, isNot(contains('172.30.13.0')));
      expect(liste, isNot(contains('172.30.13.255')));
    });
    test('une adresse invalide ne donne rien', () {
      expect(candidats('pas une adresse'), isEmpty);
      expect(candidats('300.1.1.1'), isEmpty);
    });
    test('au bord (3e nombre = 0) : pas de nombre négatif', () {
      final liste = candidats('10.0.0.5');
      expect(liste.every((a) => !a.contains('-')), isTrue);
      expect(liste, contains('10.0.1.9'));
    });
  });

  group('trouver le serveur', () {
    test('la dernière adresse connue répond : pas de recherche sur le réseau', () async {
      final essais = <String>[];
      final trouve = await trouverServeur('10.0.0.9', sonde: (h) async {
        essais.add(h);
        return h == '10.0.0.9';
      }, adresses: () async => ['10.0.0.20']);
      expect(trouve, '10.0.0.9');
      expect(essais, ['10.0.0.9']);
    });

    test("elle ne répond plus (autre Wi-Fi) : le serveur est retrouvé dans le voisinage", () async {
      final trouve = await trouverServeur('172.30.12.140', sonde: (h) async => h == '172.30.12.102', adresses: () async => ['172.30.13.3']);
      expect(trouve, '172.30.12.102');
    });

    test('première ouverture : le serveur est trouvé sur le même sous-réseau', () async {
      final trouve = await trouverServeur(null, sonde: (h) async => h == '192.168.1.57', adresses: () async => ['192.168.1.20']);
      expect(trouve, '192.168.1.57');
    });

    test('rien ne répond : null', () async {
      final trouve = await trouverServeur('10.0.0.9', sonde: (h) async => false, adresses: () async => ['10.0.0.20']);
      expect(trouve, isNull);
    });

    test("pas de réseau du tout (aucune adresse locale) : null", () async {
      expect(await trouverServeur(null, sonde: (h) async => true, adresses: () async => []), isNull);
    });
  });
}
