// ignore_for_file: deprecated_member_use
/*
  Application MOBILE (Flutter) : le scan des QR codes par les agents, sur le Zebra.
  Elle parle au BACKEND (l'API Django) : le serveur est retrouvé tout seul sur le Wi-Fi, l'agent se connecte une fois,
  puis chaque QR code lu est envoyé à /api/scan/.
*/
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'decouverte.dart';
import 'depot.dart';
import 'ecrans.dart';
import 'son.dart';

/// Tout ce que l'application utilise de l'extérieur (réseau, mémoire, son) : on le remplace dans les tests.
class Services {
  Services({required this.depot, required this.sonnerie, required this.trouver, required this.creerApi, this.dureeLogo = const Duration(seconds: 1)});

  factory Services.reels() => Services(
        depot: DepotLocal(),
        sonnerie: SonnerieAudio(),
        trouver: trouverServeur,
        creerApi: (hote, jeton) => Api(hote: hote, jeton: jeton),
      );

  final Depot depot;
  final Sonnerie sonnerie;
  final Future<String?> Function(String? derniere) trouver;
  final Api Function(String hote, String? jeton) creerApi;
  final Duration dureeLogo;
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  runApp(AppSnedai(services: Services.reels()));
}

enum Phase { demarrage, injoignable, connexion, scan }

class AppSnedai extends StatefulWidget {
  const AppSnedai({super.key, required this.services});

  final Services services;

  @override
  State<AppSnedai> createState() => _EtatApp();
}

class _EtatApp extends State<AppSnedai> {
  Phase _phase = Phase.demarrage;
  Api? _api;
  String _hote = '';
  String _identifiant = '';
  String? _message;
  String? _erreurAdresse;

  Services get _s => widget.services;

  @override
  void initState() {
    super.initState();
    _demarrer();
  }

  /// Logo, puis recherche du serveur, puis (si un jeton est enregistré) vérification de la session.
  Future<void> _demarrer() async {
    setState(() {
      _phase = Phase.demarrage;
      _erreurAdresse = null;
    });
    final logo = Future<void>.delayed(_s.dureeLogo);
    _hote = await _s.depot.lire(cleServeur) ?? '';
    final trouve = await _s.trouver(_hote.isEmpty ? null : _hote);
    await logo;
    if (!mounted) return;
    if (trouve == null) {
      setState(() => _phase = Phase.injoignable);
      return;
    }
    await _utiliserServeur(trouve);
  }

  Future<void> _utiliserServeur(String hote) async {
    _hote = hote;
    await _s.depot.ecrire(cleServeur, hote);
    final jeton = await _s.depot.lire(cleJeton);
    _api = _s.creerApi(hote, jeton);
    if (jeton == null || jeton.isEmpty) {
      if (mounted) setState(() => _phase = Phase.connexion);
      return;
    }
    try {
      final moi = await _api!.moi();
      if (!mounted) return;
      if (moi.peutScanner) {
        setState(() {
          _identifiant = moi.identifiant;
          _phase = Phase.scan;
        });
        return;
      }
    } on ErreurApi catch (erreur) {
      if (erreur.statut == 0) {
        if (mounted) setState(() => _phase = Phase.injoignable);
        return;
      }
    }
    await _oublierSession('Session expirée : reconnectez-vous.');
  }

  Future<void> _oublierSession(String? message) async {
    await _s.depot.supprimer(cleJeton);
    await _s.depot.supprimer(cleNom);
    _api?.jeton = null;
    if (mounted) {
      setState(() {
        _message = message;
        _phase = Phase.connexion;
      });
    }
  }

  Future<void> _surConnexion(String jeton, Moi moi) async {
    await _s.depot.ecrire(cleJeton, jeton);
    await _s.depot.ecrire(cleNom, moi.identifiant);
    if (mounted) {
      setState(() {
        _identifiant = moi.identifiant;
        _message = null;
        _phase = Phase.scan;
      });
    }
  }

  Future<void> _deconnecter() async {
    await _api?.deconnexion();
    await _oublierSession(null);
  }

  Future<void> _saisirAdresse(String saisie) async {
    final adresse = nettoyerAdresse(saisie);
    if (adresse.isEmpty) return;
    setState(() => _phase = Phase.demarrage);
    final api = _s.creerApi(adresse, null);
    final repond = await api.ping();
    if (!mounted) return;
    if (repond) {
      await _utiliserServeur(adresse);
    } else {
      setState(() {
        _erreurAdresse = "Aucun serveur SNEDAI ne répond à l'adresse $adresse.";
        _phase = Phase.injoignable;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final Widget ecran;
    switch (_phase) {
      case Phase.demarrage:
        ecran = const EcranMessage(key: ValueKey('demarrage'), message: 'Recherche du serveur…');
      case Phase.injoignable:
        ecran = EcranInjoignable(key: const ValueKey('injoignable'), adresseActuelle: _hote, erreur: _erreurAdresse, onReessayer: _demarrer, onSaisie: _saisirAdresse);
      case Phase.connexion:
        ecran = EcranConnexion(key: const ValueKey('connexion'), api: _api!, message: _message, onConnecte: _surConnexion);
      case Phase.scan:
        ecran = EcranScan(
          key: const ValueKey('scan'),
          service: _api!,
          sonnerie: _s.sonnerie,
          identifiant: _identifiant,
          onDeconnexion: _deconnecter,
          onSessionExpiree: () => _oublierSession('Session expirée : reconnectez-vous.'),
          onReseauPerdu: _demarrer,
        );
    }
    return MaterialApp(
      title: 'SNEDAI Scan',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: bleuSnedai, primary: bleuSnedai),
        scaffoldBackgroundColor: fondApp,
      ),
      home: ecran,
    );
  }
}
