/*
  La recherche AUTOMATIQUE du serveur : l'agent ne tape jamais d'adresse.
  1) on essaie la dernière adresse qui a marché ;
  2) sinon on cherche le serveur SNEDAI sur le Wi-Fi actuel (le sous-réseau du Zebra et les voisins) ;
  3) la première adresse qui répond à /api/ping/ est mémorisée.
*/
import 'dart:io';

import 'api.dart';

/// Les adresses à essayer autour de la nôtre : notre sous-réseau, puis son voisin direct (les réseaux d'entreprise
/// sont souvent plus grands qu'un « /24 », par exemple 172.30.12.x et 172.30.13.x), puis les deux suivants.
List<String> candidats(String ipLocale) {
  final morceaux = ipLocale.split('.');
  if (morceaux.length != 4) return <String>[];
  final nombres = morceaux.map(int.tryParse).toList();
  if (nombres.any((n) => n == null || n < 0 || n > 255)) return <String>[];
  final a = nombres[0]!, b = nombres[1]!, c = nombres[2]!, d = nombres[3]!;

  final troisiemes = <int>[c, c ^ 1, c - 1, c + 1].where((n) => n >= 0 && n <= 255).toSet().toList();
  final adresses = <String>[];
  for (final t in troisiemes) {
    for (var i = 1; i <= 254; i++) {
      if (t == c && i == d) continue;
      adresses.add('$a.$b.$t.$i');
    }
  }
  return adresses;
}

bool _adressePrivee(String ip) {
  final m = ip.split('.').map(int.tryParse).toList();
  if (m.length != 4 || m.any((n) => n == null)) return false;
  return m[0] == 10 || (m[0] == 172 && m[1]! >= 16 && m[1]! <= 31) || (m[0] == 192 && m[1] == 168);
}

/// Les adresses de l'appareil sur un réseau local (le Wi-Fi d'abord).
Future<List<String>> adressesLocales() async {
  final wifi = <String>[];
  final autres = <String>[];
  try {
    final cartes = await NetworkInterface.list(type: InternetAddressType.IPv4);
    for (final carte in cartes) {
      for (final adresse in carte.addresses) {
        if (adresse.isLoopback || !_adressePrivee(adresse.address)) continue;
        (carte.name.toLowerCase().startsWith('wlan') ? wifi : autres).add(adresse.address);
      }
    }
  } catch (_) {
    // pas de réseau : la liste reste vide
  }
  return [...wifi, ...autres];
}

typedef Sonde = Future<bool> Function(String hote);
typedef AdressesLocales = Future<List<String>> Function();

/// Essaie les adresses par paquets (en parallèle) et renvoie la première qui répond.
Future<String?> chercherSurLeReseau({Sonde? sonde, AdressesLocales? adresses, int parallele = 64, Duration limite = const Duration(seconds: 25)}) async {
  final essayer = sonde ?? sonderReseau;
  final locales = await (adresses ?? adressesLocales)();
  final debut = DateTime.now();
  for (final locale in locales) {
    final liste = candidats(locale);
    for (var i = 0; i < liste.length; i += parallele) {
      if (DateTime.now().difference(debut) > limite) return null;
      final paquet = liste.sublist(i, i + parallele > liste.length ? liste.length : i + parallele);
      final trouves = await Future.wait(paquet.map((hote) async => await essayer(hote) ? hote : null));
      for (final hote in trouves) {
        if (hote != null) return hote;
      }
    }
  }
  return null;
}

/// Vrai si cette adresse héberge le serveur SNEDAI.
Future<bool> sonderReseau(String hote, {Duration delai = const Duration(milliseconds: 700)}) async {
  try {
    return await Api(hote: hote).ping().timeout(delai, onTimeout: () => false);
  } catch (_) {
    return false;
  }
}

/// L'adresse du serveur : la dernière connue si elle répond, sinon la première trouvée sur le réseau (null si aucune).
Future<String?> trouverServeur(String? derniere, {Sonde? sonde, AdressesLocales? adresses}) async {
  if (derniere != null && derniere.isNotEmpty) {
    final marche = await (sonde ?? (h) => sonderReseau(h, delai: const Duration(seconds: 3)))(derniere);
    if (marche) return derniere;
  }
  return chercherSurLeReseau(sonde: sonde, adresses: adresses);
}
