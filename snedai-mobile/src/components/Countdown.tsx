import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';

function parts(target: number, now: number) {
  const s = Math.max(0, Math.floor((target - now) / 1000));
  return { j: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, over: s === 0 };
}

// Compte à rebours jusqu'au début de l'événement (mis à jour chaque seconde).
export function Countdown({ target, onDone }: { target: string; onDone?: () => void }) {
  const end = new Date(target).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const t = parts(end, now);
  useEffect(() => {
    if (t.over) onDone?.();
  }, [t.over, onDone]);
  const pad = (n: number) => String(n).padStart(2, '0');
  const cells: [string, string][] = [
    [String(t.j), 'jours'],
    [pad(t.h), 'h'],
    [pad(t.m), 'min'],
    [pad(t.s), 's'],
  ];
  return (
    <View style={styles.row} accessibilityLabel={`Début dans ${t.j} jours, ${t.h} heures et ${t.m} minutes`}>
      {cells.map(([value, unit]) => (
        <View key={unit} style={styles.cell}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  value: { fontSize: 22, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 10, color: '#c9c9e0', textTransform: 'uppercase', letterSpacing: 0.6 },
});
