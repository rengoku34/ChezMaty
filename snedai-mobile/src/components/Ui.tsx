import { type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import type { EventItem, User } from '../lib/types';
import { Icon, type IconName } from './Icon';

// Message d'erreur, de succès ou d'information.
export function Banner({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tone = { error: [colors.errorBg, colors.error], success: [colors.okBg, colors.ok], info: [colors.primarySoft, colors.primary] }[kind];
  return (
    <View style={[styles.banner, { backgroundColor: tone[0], borderLeftColor: tone[1] }]} accessibilityRole="alert">
      <Text style={[styles.bannerText, { color: tone[1] }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={40} color={colors.accent} strokeWidth={1.5} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'todo' | 'ok' | 'done' }) {
  const bg = { todo: colors.accent, ok: colors.ok, done: '#e4e4ec' }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: tone === 'done' ? '#4a4c5e' : colors.white }]}>{label}</Text>
    </View>
  );
}

// État affiché sur les cartes, selon la réponse de l'employé.
export function statusOf(event: EventItem): { label: string; tone: 'todo' | 'ok' | 'done' } {
  if (event.termine) return { label: 'Terminé', tone: 'done' };
  if (event.participation?.present) return { label: 'Présence validée', tone: 'ok' };
  if (event.participation) return { label: 'Inscrit(e)', tone: 'ok' };
  return { label: 'À confirmer', tone: 'todo' };
}

export function Avatar({ user }: { user: User }) {
  return (
    <View style={styles.avatar} accessibilityLabel={`${user.prenom} ${user.nom}`}>
      <Text style={styles.avatarText}>{(user.prenom[0] ?? '') + (user.nom[0] ?? '')}</Text>
    </View>
  );
}

export function ScreenTitle({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.titleRow}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={onBack} hitSlop={10} style={styles.back}>
          <Icon name="chevron-left" size={26} color={colors.primary} />
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

// Confirmation (boîte de dialogue native, ou fenêtre du navigateur sur le web).
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.sm, borderLeftWidth: 4, paddingVertical: 10, paddingHorizontal: 12 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', gap: 6, padding: 32, backgroundColor: colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: '#b6b8c8', borderRadius: radius.lg },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  pill: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 14, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  back: { marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.primary, letterSpacing: -0.4 },
});
