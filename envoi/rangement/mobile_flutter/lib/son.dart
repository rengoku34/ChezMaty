/*
  Le bip du scan. Deux notes montantes si la présence est validée, deux sons graves sinon.
  Le son est fabriqué ici (aucun fichier audio à fournir), puis joué ; le Zebra vibre aussi.
*/
import 'dart:math';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

const int _frequenceEchantillonnage = 22050;

/// Un fichier WAV (16 bits, mono) contenant les notes : (fréquence en Hz, début en secondes, durée en secondes).
Uint8List fabriquerWav(List<(double, double, double)> notes, {double volume = 0.8}) {
  final fin = notes.map((n) => n.$2 + n.$3).reduce(max) + 0.05;
  final total = (fin * _frequenceEchantillonnage).round();
  final echantillons = List<int>.filled(total, 0);
  for (final (frequence, debut, duree) in notes) {
    final premier = (debut * _frequenceEchantillonnage).round();
    final dernier = min(total, ((debut + duree) * _frequenceEchantillonnage).round());
    for (var i = premier; i < dernier; i++) {
      final t = (i - premier) / _frequenceEchantillonnage;
      final enveloppe = min(1.0, min(t / 0.005, (duree - t) / 0.01)).clamp(0.0, 1.0);     // évite le « clic » au début et à la fin
      final onde = sin(2 * pi * frequence * t) >= 0 ? 1.0 : -1.0;                         // son « carré » : plus perçant, bien audible
      echantillons[i] = (onde * enveloppe * volume * 32767 * 0.5).round();
    }
  }
  final donnees = ByteData(44 + total * 2);
  void texte(int position, String valeur) {
    for (var i = 0; i < valeur.length; i++) {
      donnees.setUint8(position + i, valeur.codeUnitAt(i));
    }
  }

  texte(0, 'RIFF');
  donnees.setUint32(4, 36 + total * 2, Endian.little);
  texte(8, 'WAVE');
  texte(12, 'fmt ');
  donnees.setUint32(16, 16, Endian.little);
  donnees.setUint16(20, 1, Endian.little);                       // PCM
  donnees.setUint16(22, 1, Endian.little);                       // mono
  donnees.setUint32(24, _frequenceEchantillonnage, Endian.little);
  donnees.setUint32(28, _frequenceEchantillonnage * 2, Endian.little);
  donnees.setUint16(32, 2, Endian.little);
  donnees.setUint16(34, 16, Endian.little);
  texte(36, 'data');
  donnees.setUint32(40, total * 2, Endian.little);
  for (var i = 0; i < total; i++) {
    donnees.setInt16(44 + i * 2, echantillons[i], Endian.little);
  }
  return donnees.buffer.asUint8List();
}

/// Deux notes montantes (présence validée) ou deux sons graves (déjà scanné, inconnu).
Uint8List fabriquerBip({required bool ok}) =>
    fabriquerWav(ok ? [(880.0, 0.0, 0.14), (1320.0, 0.16, 0.22)] : [(200.0, 0.0, 0.22), (200.0, 0.3, 0.22)]);

abstract class Sonnerie {
  Future<void> jouer({required bool ok});
}

class SonnerieAudio implements Sonnerie {
  final AudioPlayer _lecteur = AudioPlayer();
  late final Uint8List _bipOk = fabriquerBip(ok: true);
  late final Uint8List _bipErreur = fabriquerBip(ok: false);

  @override
  Future<void> jouer({required bool ok}) async {
    try {
      await (ok ? HapticFeedback.mediumImpact() : HapticFeedback.heavyImpact());
      await _lecteur.stop();
      await _lecteur.play(BytesSource(ok ? _bipOk : _bipErreur), volume: 1.0);
    } catch (_) {
      // pas de son possible : tant pis, l'écran vert, orange ou rouge reste là
    }
  }
}
