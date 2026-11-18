// ignore_for_file: deprecated_member_use
/*
  Les écrans de l'application : démarrage (logo + recherche du serveur), serveur injoignable, connexion et scan.
  Vert + deux notes montantes : présence validée. Orange : déjà scanné. Rouge : code inconnu.
*/
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'api.dart';
import 'son.dart';

const Color bleuSnedai = Color(0xFF26246A);
const Color orangeSnedai = Color(0xFFF08A46);
const Color fondApp = Color(0xFFEEF0F5);

class LogoSnedai extends StatelessWidget {
  const LogoSnedai({super.key, this.hauteur = 64});

  final double hauteur;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
      child: Image.asset('assets/logo.png', height: hauteur, fit: BoxFit.contain),
    );
  }
}

/// Le logo SNEDAI centré, avec un message (« Recherche du serveur… ») et un cercle qui tourne.
class EcranMessage extends StatelessWidget {
  const EcranMessage({super.key, required this.message, this.enCours = true});

  final String message;
  final bool enCours;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const LogoSnedai(hauteur: 72),
              const SizedBox(height: 32),
              Text(message, style: const TextStyle(fontSize: 18, color: bleuSnedai)),
              const SizedBox(height: 20),
              if (enCours) const CircularProgressIndicator(color: orangeSnedai),
            ],
          ),
        ),
      ),
    );
  }
}

/// Rien n'a été trouvé sur le réseau : on peut réessayer, ou saisir l'adresse à la main (en dernier recours).
class EcranInjoignable extends StatelessWidget {
  const EcranInjoignable({super.key, required this.adresseActuelle, required this.onReessayer, required this.onSaisie, this.erreur});

  final String adresseActuelle;
  final VoidCallback onReessayer;
  final Future<void> Function(String adresse) onSaisie;
  final String? erreur;

  Future<void> _demanderAdresse(BuildContext context) async {
    final champ = TextEditingController(text: adresseActuelle);
    final valeur = await showDialog<String>(
      context: context,
      builder: (contexte) => AlertDialog(
        title: const Text('Adresse du serveur'),
        content: TextField(
          controller: champ,
          autofocus: true,
          autocorrect: false,
          enableSuggestions: false,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(hintText: 'Ex. : 172.30.13.3'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(contexte), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(contexte, champ.text), child: const Text('Enregistrer')),
        ],
      ),
    );
    if (valeur != null && valeur.trim().isNotEmpty) await onSaisie(valeur);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: fondApp,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: LogoSnedai()),
              const SizedBox(height: 28),
              const Text('Serveur injoignable', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFFB42318))),
              const SizedBox(height: 10),
              const Text('Vérifiez que le Zebra est sur le même Wi-Fi que le serveur, et que le serveur est lancé.', textAlign: TextAlign.center),
              if (adresseActuelle.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('Dernière adresse : $adresseActuelle', textAlign: TextAlign.center, style: const TextStyle(color: bleuSnedai)),
              ],
              if (erreur != null) ...[
                const SizedBox(height: 10),
                Text(erreur!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFB42318))),
              ],
              const SizedBox(height: 24),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: orangeSnedai, minimumSize: const Size.fromHeight(52)),
                onPressed: onReessayer,
                child: const Text('Réessayer', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), foregroundColor: bleuSnedai),
                onPressed: () => _demanderAdresse(context),
                child: const Text("Changer l'adresse du serveur"),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// La connexion de l'agent (identifiant et mot de passe).
class EcranConnexion extends StatefulWidget {
  const EcranConnexion({super.key, required this.api, required this.onConnecte, this.message});

  final Api api;
  final Future<void> Function(String jeton, Moi moi) onConnecte;
  final String? message;

  @override
  State<EcranConnexion> createState() => _EtatConnexion();
}

class _EtatConnexion extends State<EcranConnexion> {
  final _identifiant = TextEditingController();
  final _motDePasse = TextEditingController();
  String? _erreur;
  bool _enCours = false;

  @override
  void initState() {
    super.initState();
    _erreur = widget.message;
  }

  @override
  void dispose() {
    _identifiant.dispose();
    _motDePasse.dispose();
    super.dispose();
  }

  Future<void> _seConnecter() async {
    if (_identifiant.text.trim().isEmpty || _motDePasse.text.isEmpty) {
      setState(() => _erreur = "Saisissez l'identifiant et le mot de passe.");
      return;
    }
    setState(() {
      _enCours = true;
      _erreur = null;
    });
    try {
      final jeton = await widget.api.connexion(_identifiant.text, _motDePasse.text);
      final moi = await widget.api.moi();
      if (!moi.peutScanner) {
        await widget.api.deconnexion();
        throw ErreurApi(403, "Ce compte n'a pas le droit de scanner.");
      }
      await widget.onConnecte(jeton, moi);
    } on ErreurApi catch (erreur) {
      if (mounted) setState(() => _erreur = erreur.message);
    } finally {
      if (mounted) setState(() => _enCours = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: fondApp,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: LogoSnedai()),
                const SizedBox(height: 24),
                Card(
                  color: Colors.white,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Scan des présences', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: bleuSnedai)),
                        const SizedBox(height: 14),
                        if (_erreur != null)
                          Container(
                            padding: const EdgeInsets.all(10),
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(color: const Color(0xFFFDECEA), borderRadius: BorderRadius.circular(8)),
                            child: Text(_erreur!, key: const Key('erreur-connexion'), style: const TextStyle(color: Color(0xFFB42318))),
                          ),
                        TextField(
                          key: const Key('champ-identifiant'),
                          controller: _identifiant,
                          autocorrect: false,
                          enableSuggestions: false,
                          textCapitalization: TextCapitalization.none,
                          keyboardType: TextInputType.visiblePassword,
                          autofillHints: const [AutofillHints.username],
                          decoration: const InputDecoration(labelText: 'Identifiant', border: OutlineInputBorder()),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          key: const Key('champ-mot-de-passe'),
                          controller: _motDePasse,
                          obscureText: true,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => _seConnecter(),
                          decoration: const InputDecoration(labelText: 'Mot de passe', border: OutlineInputBorder()),
                        ),
                        const SizedBox(height: 18),
                        FilledButton(
                          key: const Key('bouton-connexion'),
                          style: FilledButton.styleFrom(backgroundColor: orangeSnedai, minimumSize: const Size.fromHeight(52)),
                          onPressed: _enCours ? null : _seConnecter,
                          child: _enCours
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                              : const Text('Se connecter', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Aspect {
  const _Aspect(this.couleur, this.icone, this.titre);

  final Color couleur;
  final String icone;
  final String titre;
}

const Map<String, _Aspect> _aspects = {
  'attente': _Aspect(Color(0xFF3B4A6B), '◯', 'Prêt à scanner'),
  'present': _Aspect(Color(0xFF1E8E3E), '✔', 'Présence validée'),
  'deja': _Aspect(Color(0xFFE8710A), '!', 'Déjà scanné'),
  'inconnu': _Aspect(Color(0xFFC62828), '✖', 'Inconnu'),
};

class _LigneHistorique {
  const _LigneHistorique(this.texte, this.couleur);

  final String texte;
  final Color couleur;
}

/// L'écran de scan : le lecteur du Zebra « tape » le code, puis la touche Entrée ; l'application l'envoie à l'API.
class EcranScan extends StatefulWidget {
  const EcranScan({
    super.key,
    required this.service,
    required this.sonnerie,
    required this.identifiant,
    required this.onDeconnexion,
    required this.onSessionExpiree,
    required this.onReseauPerdu,
  });

  final ServiceScan service;
  final Sonnerie sonnerie;
  final String identifiant;
  final VoidCallback onDeconnexion;
  final VoidCallback onSessionExpiree;
  final VoidCallback onReseauPerdu;

  @override
  State<EcranScan> createState() => _EtatScan();
}

class _EtatScan extends State<EcranScan> {
  final _champ = TextEditingController();
  final _focus = FocusNode();
  final List<_LigneHistorique> _historique = [];

  String _statut = 'attente';
  String _detail = '';
  bool _occupe = false;
  String _dernierCode = '';
  DateTime _dernierMoment = DateTime.fromMillisecondsSinceEpoch(0);
  String _tampon = '';
  Timer? _retourAttente;
  Timer? _minuteurSaisie;
  Timer? _minuteurTampon;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable().catchError((_) {});       // l'écran reste allumé pendant les scans (sans effet dans les tests)
    HardwareKeyboard.instance.addHandler(_surTouche);
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_surTouche);
    _retourAttente?.cancel();
    _minuteurSaisie?.cancel();
    _minuteurTampon?.cancel();
    WakelockPlus.disable().catchError((_) {});
    _champ.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Plan B : si le texte n'arrive pas dans le champ, on assemble les touches reçues par l'appareil.
  bool _surTouche(KeyEvent evenement) {
    if (evenement is! KeyDownEvent) return false;
    if (evenement.logicalKey == LogicalKeyboardKey.enter || evenement.logicalKey == LogicalKeyboardKey.numpadEnter) {
      _minuteurTampon?.cancel();
      _viderTampon();
      return false;
    }
    final caractere = evenement.character;
    final clavier = HardwareKeyboard.instance;
    if (caractere != null && caractere.length == 1 && !clavier.isControlPressed && !clavier.isAltPressed && !clavier.isMetaPressed) {
      _tampon += caractere;
      _minuteurTampon?.cancel();
      _minuteurTampon = Timer(const Duration(milliseconds: 500), _viderTampon);
    }
    return false;
  }

  void _viderTampon() {
    final texte = _tampon;
    _tampon = '';
    if (texte.length >= 20) _envoyer(texte);
  }

  Future<void> _envoyer(String brut) async {
    final code = brut.trim();
    if (code.isEmpty || _occupe || (code == _dernierCode && DateTime.now().difference(_dernierMoment) < const Duration(seconds: 3))) return;
    _occupe = true;
    _dernierCode = code;
    _dernierMoment = DateTime.now();
    try {
      final reponse = await widget.service.scanner(code);
      _afficher(reponse.statut, reponse.personne, reponse.message);
    } on ErreurApi catch (erreur) {
      if (erreur.statut == 401) {
        widget.onSessionExpiree();
        return;
      }
      _afficher('inconnu', null, erreur.message, detailSeul: true);
      if (erreur.statut == 0) widget.onReseauPerdu();           // le serveur a peut-être changé d'adresse : on le recherche
    } finally {
      _occupe = false;
      if (mounted) {
        _champ.clear();
        _focus.requestFocus();
      }
    }
  }

  void _afficher(String statut, Personne? personne, String message, {bool detailSeul = false}) {
    if (!mounted) return;
    final aspect = _aspects[statut] ?? _aspects['inconnu']!;
    var detail = '';
    if (detailSeul) {
      detail = message;
    } else if (personne != null) {
      detail = '${personne.nomComplet} · ${personne.filiale}\n${personne.evenement}';
      if (statut == 'deja' && message.isNotEmpty) detail += '\n$message';
    } else if (statut == 'inconnu') {
      detail = 'QR code non reconnu';
    }
    final heure = TimeOfDay.now();
    final horloge = '${heure.hour.toString().padLeft(2, '0')}:${heure.minute.toString().padLeft(2, '0')}';
    setState(() {
      _statut = statut;
      _detail = detail;
      _historique.insert(0, _LigneHistorique('$horloge · ${personne?.nomComplet ?? 'Inconnu'} · ${aspect.titre}', aspect.couleur));
      if (_historique.length > 8) _historique.removeLast();
    });
    widget.sonnerie.jouer(ok: statut == 'present');
    _retourAttente?.cancel();
    _retourAttente = Timer(const Duration(seconds: 4), () {
      if (mounted) {
        setState(() {
          _statut = 'attente';
          _detail = '';
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final aspect = _aspects[_statut] ?? _aspects['attente']!;
    return Scaffold(
      backgroundColor: fondApp,
      body: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => _focus.requestFocus(),
          child: Column(
            children: [
              Container(
                color: bleuSnedai,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    const LogoSnedai(hauteur: 30),
                    const Spacer(),
                    Text(widget.identifiant, style: const TextStyle(color: Colors.white)),
                    TextButton(
                      key: const Key('bouton-deconnexion'),
                      onPressed: widget.onDeconnexion,
                      child: const Text('Déconnexion', style: TextStyle(color: Colors.white, decoration: TextDecoration.underline)),
                    ),
                  ],
                ),
              ),
              // Le champ qui reçoit ce que « tape » le lecteur : invisible, et sans clavier à l'écran.
              SizedBox(
                width: 1,
                height: 1,
                child: Opacity(
                  opacity: 0,
                  child: TextField(
                    key: const Key('champ-lecteur'),
                    controller: _champ,
                    focusNode: _focus,
                    keyboardType: TextInputType.none,
                    autocorrect: false,
                    enableSuggestions: false,
                    onSubmitted: _envoyer,
                    onChanged: (texte) {
                      // Certains lecteurs n'envoient pas Entrée : on envoie le code dès que le texte a fini de s'écrire.
                      _minuteurSaisie?.cancel();
                      _minuteurSaisie = Timer(const Duration(milliseconds: 400), () {
                        if (_champ.text.trim().length >= 32) _envoyer(_champ.text);
                      });
                    },
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Expanded(
                        flex: 5,
                        child: AnimatedContainer(
                          key: const Key('carte-etat'),
                          duration: const Duration(milliseconds: 150),
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(color: aspect.couleur, borderRadius: BorderRadius.circular(18)),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(aspect.icone, key: const Key('icone-etat'), style: const TextStyle(fontSize: 72, color: Colors.white)),
                              const SizedBox(height: 8),
                              Text(aspect.titre, key: const Key('titre-etat'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: Colors.white)),
                              const SizedBox(height: 10),
                              Text(_detail, key: const Key('detail-etat'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, color: Colors.white)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        flex: 3,
                        child: ListView(
                          children: [
                            for (final ligne in _historique)
                              Container(
                                margin: const EdgeInsets.only(bottom: 6),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border(left: BorderSide(color: ligne.couleur, width: 5))),
                                child: Text(ligne.texte),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
