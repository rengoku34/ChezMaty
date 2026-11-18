/*
  Le dialogue avec le BACKEND (l'API Django) : connexion par jeton, puis chaque QR code lu est envoyé à /api/scan/.
  L'application ne garde aucune règle : le serveur décide si la présence est validée, déjà scannée ou inconnue.
*/
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

const int portServeur = 8000;

/// L'adresse de base du serveur : « 172.30.13.3 » devient « http://172.30.13.3:8000 ».
String urlServeur(String hote) => 'http://${hote.contains(':') ? hote : '$hote:$portServeur'}';

/// Garde seulement « adresse » ou « adresse:port » (enlève http://, les espaces et ce qui suit un /).
String nettoyerAdresse(String? saisie) {
  var texte = (saisie ?? '').trim();
  if (texte.startsWith('http://')) texte = texte.substring(7);
  if (texte.startsWith('https://')) texte = texte.substring(8);
  final barre = texte.indexOf('/');
  if (barre >= 0) texte = texte.substring(0, barre);
  return texte.trim();
}

class ErreurApi implements Exception {
  ErreurApi(this.statut, this.message);

  /// 0 = pas de réseau, sinon le code HTTP.
  final int statut;
  final String message;

  @override
  String toString() => message;
}

class Personne {
  const Personne({required this.nom, required this.prenom, required this.filiale, required this.evenement, required this.creneau});

  factory Personne.depuisJson(Map<String, dynamic> json) => Personne(
        nom: '${json['nom'] ?? ''}',
        prenom: '${json['prenom'] ?? ''}',
        filiale: '${json['filiale'] ?? ''}',
        evenement: '${json['evenement'] ?? ''}',
        creneau: '${json['creneau'] ?? ''}',
      );

  final String nom;
  final String prenom;
  final String filiale;
  final String evenement;
  final String creneau;

  String get nomComplet => '$prenom $nom'.trim();
}

/// Ce que le serveur répond à un scan : « present », « deja » ou « inconnu ».
class ReponseScan {
  const ReponseScan({required this.statut, required this.message, this.personne});

  final String statut;
  final String message;
  final Personne? personne;
}

class Moi {
  const Moi({required this.identifiant, required this.role});

  final String identifiant;
  final String role;

  bool get peutScanner => role == 'agent' || role == 'administrateur';
}

/// Ce dont l'écran de scan a besoin (l'API réelle, ou une fausse dans les tests).
abstract class ServiceScan {
  Future<ReponseScan> scanner(String code);
}

class Api implements ServiceScan {
  Api({required this.hote, this.jeton, http.Client? client}) : _client = client ?? http.Client();

  final String hote;
  String? jeton;
  final http.Client _client;

  static const Duration _delai = Duration(seconds: 8);

  Uri _uri(String chemin) => Uri.parse('${urlServeur(hote)}$chemin');

  Map<String, String> get _entetes => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (jeton != null) 'Authorization': 'Token $jeton',
      };

  Future<http.Response> _envoyer(Future<http.Response> Function() demande) async {
    try {
      return await demande().timeout(_delai);
    } on TimeoutException {
      throw ErreurApi(0, 'Le serveur ne répond pas. Vérifiez le réseau.');
    } on SocketException {
      throw ErreurApi(0, 'Connexion impossible. Vérifiez le réseau.');
    } on http.ClientException {
      throw ErreurApi(0, 'Connexion impossible. Vérifiez le réseau.');
    }
  }

  Map<String, dynamic> _json(http.Response reponse) {
    try {
      final donnees = jsonDecode(utf8.decode(reponse.bodyBytes));
      if (donnees is Map<String, dynamic>) return donnees;
    } catch (_) {
      // pas de contenu lisible
    }
    return <String, dynamic>{};
  }

  /// Le serveur SNEDAI répond-il à cette adresse ?
  Future<bool> ping() async {
    try {
      final reponse = await _envoyer(() => _client.get(_uri('/api/ping/'), headers: _entetes));
      return reponse.statusCode == 200 && _json(reponse)['application'] == 'snedai-evenements';
    } on ErreurApi {
      return false;
    }
  }

  /// Envoie l'identifiant et le mot de passe ; renvoie le jeton.
  Future<String> connexion(String identifiant, String motDePasse) async {
    final reponse = await _envoyer(() => _client.post(
          _uri('/api/auth/token/'),
          headers: _entetes,
          body: jsonEncode({'username': identifiant.trim(), 'password': motDePasse}),
        ));
    if (reponse.statusCode == 200) {
      final jetonRecu = _json(reponse)['token'];
      if (jetonRecu is String && jetonRecu.isNotEmpty) {
        jeton = jetonRecu;
        return jetonRecu;
      }
    }
    if (reponse.statusCode == 400) throw ErreurApi(400, 'Identifiant ou mot de passe incorrect.');
    if (reponse.statusCode == 429) throw ErreurApi(429, 'Trop de tentatives. Réessayez dans une minute.');
    throw ErreurApi(reponse.statusCode, 'Une erreur est survenue (${reponse.statusCode}).');
  }

  /// Qui suis-je ? Sert aussi à vérifier que le jeton enregistré est encore valable (401 sinon).
  Future<Moi> moi() async {
    final reponse = await _envoyer(() => _client.get(_uri('/api/auth/moi/'), headers: _entetes));
    if (reponse.statusCode == 401) throw ErreurApi(401, 'Session expirée : reconnectez-vous.');
    if (reponse.statusCode != 200) throw ErreurApi(reponse.statusCode, 'Une erreur est survenue (${reponse.statusCode}).');
    final donnees = _json(reponse);
    return Moi(identifiant: '${donnees['username'] ?? ''}', role: '${donnees['role'] ?? 'aucun'}');
  }

  @override
  Future<ReponseScan> scanner(String code) async {
    final reponse = await _envoyer(() => _client.post(_uri('/api/scan/'), headers: _entetes, body: jsonEncode({'code': code})));
    if (reponse.statusCode == 401) throw ErreurApi(401, 'Session expirée : reconnectez-vous.');
    if (reponse.statusCode == 403) throw ErreurApi(403, 'Accès refusé');
    final donnees = _json(reponse);
    if (reponse.statusCode == 200 || reponse.statusCode == 409 || reponse.statusCode == 404) {
      final personne = donnees['personne'];
      return ReponseScan(
        statut: '${donnees['statut'] ?? 'inconnu'}',
        message: '${donnees['message'] ?? ''}',
        personne: personne is Map<String, dynamic> ? Personne.depuisJson(personne) : null,
      );
    }
    throw ErreurApi(reponse.statusCode, 'Erreur du serveur (${reponse.statusCode}).');
  }

  /// Supprime le jeton sur le serveur (sans bloquer si le réseau est coupé).
  Future<void> deconnexion() async {
    try {
      await _envoyer(() => _client.post(_uri('/api/auth/deconnexion/'), headers: _entetes));
    } on ErreurApi {
      // le jeton local est supprimé de toute façon
    }
    jeton = null;
  }
}
