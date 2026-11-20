/*
  Le lecteur de codes-barres du Zebra (DataWedge). L'application le configure toute seule (profil « SnedaiScan »),
  puis reçoit chaque code lu par un message envoyé par DataWedge : plus besoin de « taper » les touches.
  Le côté Android de ce lien est dans android/app/src/main/java/ci/snedai/snedai_scan/MainActivity.java.
*/
import 'package:flutter/services.dart';

class Lecteur {
  static const EventChannel _codes = EventChannel('ci.snedai.snedai_scan/scan');
  static const MethodChannel _configuration = MethodChannel('ci.snedai.snedai_scan/datawedge');

  /// Les codes lus, un par un.
  static Stream<String> codes() => _codes.receiveBroadcastStream().where((code) => code is String).cast<String>();

  /// Crée (ou met à jour) le profil DataWedge de l'application. Sans effet sur un appareil qui n'est pas un Zebra.
  static Future<void> configurer() async {
    try {
      await _configuration.invokeMethod<void>('configurer');
    } catch (_) {
      // pas de DataWedge (téléphone, tests) : le clavier du lecteur, s'il existe, reste utilisable
    }
  }
}
