// ignore_for_file: deprecated_member_use, unnecessary_import
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:snedai_scan/son.dart';

void main() {
  String lire(Uint8List o, int debut, int longueur) => String.fromCharCodes(o.sublist(debut, debut + longueur));

  test('le bip est un vrai fichier WAV (en-tête et tailles cohérents)', () {
    final wav = fabriquerBip(ok: true);
    final donnees = ByteData.sublistView(wav);
    expect(lire(wav, 0, 4), 'RIFF');
    expect(lire(wav, 8, 4), 'WAVE');
    expect(lire(wav, 12, 4), 'fmt ');
    expect(lire(wav, 36, 4), 'data');
    expect(donnees.getUint32(4, Endian.little), wav.length - 8);
    expect(donnees.getUint32(40, Endian.little), wav.length - 44);
    expect(donnees.getUint16(22, Endian.little), 1);          // mono
    expect(donnees.getUint16(34, Endian.little), 16);         // 16 bits
  });

  test('durée : environ 0,4 s pour « validé », 0,55 s pour « erreur »', () {
    double secondes(Uint8List w) => (w.length - 44) / 2 / 22050;
    expect(secondes(fabriquerBip(ok: true)), closeTo(0.43, 0.05));
    expect(secondes(fabriquerBip(ok: false)), closeTo(0.57, 0.05));
  });

  test('le son est audible (pas du silence) et ne dépasse pas la plage 16 bits', () {
    final wav = fabriquerBip(ok: true);
    final donnees = ByteData.sublistView(wav);
    var maximum = 0;
    for (var i = 44; i < wav.length; i += 2) {
      final v = donnees.getInt16(i, Endian.little).abs();
      if (v > maximum) maximum = v;
    }
    expect(maximum, greaterThan(5000));
    expect(maximum, lessThanOrEqualTo(32767));
  });

  test('les deux sons sont différents', () {
    expect(fabriquerBip(ok: true), isNot(equals(fabriquerBip(ok: false))));
  });
}
