import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { photoSource } from '../lib/api';
import { colors, radius, shadow } from '../lib/theme';
import type { EventItem } from '../lib/types';
import { Icon } from './Icon';
import { Pill, statusOf } from './Ui';

// Visuel d'un événement : la photo si elle existe, sinon un fond marine aux couleurs SNEDAI.
export function EventCover({ event, height }: { event: EventItem; height: number }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : photoSource(event.photo);
  return source ? (
    <Image source={source} onError={() => setFailed(true)} style={{ width: '100%', height }} resizeMode="cover" accessibilityLabel="Photo de l’événement" />
  ) : (
    <View style={[styles.placeholder, { height }]}>
      <Icon name="calendar" size={44} color="rgba(255,255,255,0.35)" strokeWidth={1.4} />
    </View>
  );
}

export function EventCard({ event, onPress }: { event: EventItem; onPress: () => void }) {
  const status = statusOf(event);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.titre}, ${event.quand}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }, event.termine && { opacity: 0.75 }]}>
      <View>
        <EventCover event={event} height={event.photo ? 150 : 96} />
        {event.jour ? (
          <View style={styles.chip}>
            <Text style={styles.chipDay}>{event.jour}</Text>
            <Text style={styles.chipMonth}>{event.mois}</Text>
          </View>
        ) : null}
        <View style={styles.status}>
          <Pill label={status.label} tone={status.tone} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {event.titre}
        </Text>
        {event.heures ? (
          <View style={styles.meta}>
            <Icon name="clock" size={14} color={colors.muted} />
            <Text style={styles.metaText}>{event.heures}</Text>
          </View>
        ) : null}
        {event.lieu ? (
          <View style={styles.meta}>
            <Icon name="pin" size={14} color={colors.muted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.lieu}
            </Text>
          </View>
        ) : null}
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{event.termine ? 'Voir le détail' : event.participation ? 'Voir mon billet' : 'Répondre'}</Text>
          <Icon name="chevron-right" size={16} color={colors.accentDark} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  placeholder: { width: '100%', backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', left: 12, top: 12, minWidth: 50, alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.white, borderRadius: radius.md, borderTopWidth: 3, borderTopColor: colors.accent, ...shadow },
  chipDay: { fontSize: 20, fontWeight: '700', color: colors.primary, lineHeight: 22 },
  chipMonth: { fontSize: 11, fontWeight: '700', color: colors.accentDark, textTransform: 'uppercase', letterSpacing: 0.6 },
  status: { position: 'absolute', right: 12, top: 12 },
  body: { padding: 14, gap: 4 },
  title: { fontSize: 17, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 14, color: colors.muted, flexShrink: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  ctaText: { fontSize: 14, fontWeight: '600', color: colors.accentDark },
});
