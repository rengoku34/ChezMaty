import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { api } from '../../../lib/api';
import { colors, radius } from '../../../lib/theme';
import type { ScanResult } from '../../../lib/types';

const FULL_CODE = /^SNEDAI-EVT:[A-Za-z0-9_-]{32}$/;
const tones = {
  present: { bg: colors.okBg, fg: colors.ok },
  deja: { bg: '#fff4e5', fg: colors.accentDark },
  termine: { bg: colors.errorBg, fg: colors.error },
  inconnu: { bg: colors.errorBg, fg: colors.error },
} as const;

export default function Scanner() {
  useKeepAwake();
  const [permission, requestPermission] = useCameraPermissions();
  const [wedge, setWedge] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (lock.current || !FULL_CODE.test(code)) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await api.scan(code);
      setResult(r);
      setHistory((h) => [r, ...h].slice(0, 8));
      Haptics.notificationAsync(r.status === 'present' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    } catch (e) {
      setResult({ ok: false, status: 'inconnu', message: e instanceof Error ? e.message : 'Scan impossible. Vérifiez la connexion.' });
    } finally {
      setBusy(false);
      setTyped('');
      // Petite pause pour ne pas rescanner le même billet en boucle.
      setTimeout(() => (lock.current = false), 1800);
    }
  }, []);

  const tone = result ? tones[result.status] : null;
  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Scanner</Text>
        <Button small variant="outline" icon={wedge ? 'camera' : 'keyboard'} label={wedge ? 'Caméra' : 'Lecteur'} onPress={() => setWedge((w) => !w)} />
      </View>

      {wedge ? (
        <View style={styles.wedge}>
          <Icon name="scan" size={48} color={colors.primary} />
          <Text style={styles.hintBig}>Appuyez sur la gâchette du terminal</Text>
          <TextInput value={typed} onChangeText={(t) => { setTyped(t); submit(t); }} autoFocus autoCapitalize="none" autoCorrect={false} showSoftInputOnFocus={false} blurOnSubmit={false} onSubmitEditing={() => submit(typed)} style={styles.hiddenInput} />
        </View>
      ) : !permission ? null : !permission.granted ? (
        <View style={styles.wedge}>
          <Icon name="camera" size={44} color={colors.primary} />
          <Text style={styles.hint}>L’accès à la caméra est nécessaire pour lire les billets.</Text>
          <Button label="Autoriser la caméra" onPress={requestPermission} />
        </View>
      ) : (
        <View style={styles.camera}>
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : ({ data }) => submit(data)} />
          <View style={styles.frame} pointerEvents="none" />
        </View>
      )}

      {result && tone ? (
        <View style={[styles.result, { backgroundColor: tone.bg }]}>
          <Text style={[styles.resultMsg, { color: tone.fg }]}>{result.message}</Text>
          {result.person ? <Text style={styles.person}>{result.person.prenom} {result.person.nom} · {result.person.filiale}</Text> : null}
        </View>
      ) : null}

      {history.length ? (
        <View style={styles.history}>
          {history.slice(0, 4).map((h, i) => (
            <Text key={i} style={styles.histLine} numberOfLines={1}>
              {h.status === 'present' ? '✓' : '•'} {h.person ? `${h.person.prenom} ${h.person.nom}` : h.message}
            </Text>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: colors.primary },
  camera: { flex: 1, margin: 16, marginTop: 0, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 220, height: 220, borderWidth: 3, borderColor: colors.accent, borderRadius: radius.lg },
  wedge: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  hintBig: { fontSize: 18, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  result: { margin: 16, padding: 16, borderRadius: radius.lg, gap: 4 },
  resultMsg: { fontSize: 18, fontWeight: '700' },
  person: { fontSize: 14, color: colors.text },
  history: { paddingHorizontal: 16, paddingBottom: 12, gap: 2 },
  histLine: { fontSize: 13, color: colors.muted },
});
