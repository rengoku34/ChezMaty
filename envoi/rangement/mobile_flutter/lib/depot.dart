/* Ce que l'application retient entre deux ouvertures : l'adresse du serveur, le jeton de connexion et le nom de l'agent. */
import 'package:shared_preferences/shared_preferences.dart';

abstract class Depot {
  Future<String?> lire(String cle);
  Future<void> ecrire(String cle, String valeur);
  Future<void> supprimer(String cle);
}

class DepotLocal implements Depot {
  @override
  Future<String?> lire(String cle) async => (await SharedPreferences.getInstance()).getString(cle);

  @override
  Future<void> ecrire(String cle, String valeur) async => (await SharedPreferences.getInstance()).setString(cle, valeur);

  @override
  Future<void> supprimer(String cle) async => (await SharedPreferences.getInstance()).remove(cle);
}

/// Pour les tests : tout reste en mémoire.
class DepotMemoire implements Depot {
  final Map<String, String> donnees = {};

  @override
  Future<String?> lire(String cle) async => donnees[cle];

  @override
  Future<void> ecrire(String cle, String valeur) async => donnees[cle] = valeur;

  @override
  Future<void> supprimer(String cle) async => donnees.remove(cle);
}

const String cleServeur = 'serveur';
const String cleJeton = 'jeton';
const String cleNom = 'nom';
