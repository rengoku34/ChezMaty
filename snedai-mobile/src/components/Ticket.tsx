import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius, shadow } from '../lib/theme';
import type { EventItem, User } from '../lib/types';
import { Icon } from './Icon';

// Billet d'entrée : nom, filiale et QR code à présenter à l'agent d'accueil.
export function Ticket({ user, event, qr }: { user: User; event: EventItem; qr: string }) {
  return (
    <View style={styles.ticket}>
      <View style={styles.head}>
        <Icon name="ticket" size={16} color={colors.white} />
        <Text style={styles.headText}>BILLET D’ENTRÉE</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>
          {user.prenom} {user.nom}
        </Text>
        <Text style={styles.sub}>{user.filiale}</Text>
        <View style={styles.qrBox} accessibilityLabel="QR code personnel à présenter à l’entrée">
          <QRCode value={qr} size={210} color="#1d1d2b" backgroundColor="#ffffff" ecl="M" />
        </View>
        <Text style={styles.note}>Présentez ce QR code à l’agent d’accueil.</Text>
      </View>
      <View style={styles.foot}>
        <Text style={styles.footTitle} numberOfLines={1}>
          {event.titre}
        </Text>
        <Text style={styles.footText}>{event.date}</Text>
      </View>
    </View>
  );
}

// Billet après le scan : la venue est confirmée, plus de QR code à montrer.
export function ValidatedTicket({ user, since }: { user: User; since: string | null }) {
  return (
    <View style={styles.ticket}>
      <View style={[styles.head, { backgroundColor: colors.ok, borderBottomColor: '#0f5528' }]}>
        <Icon name="check" size={16} color={colors.white} />
        <Text style={styles.headText}>PRÉSENCE VALIDÉE</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>
          {user.prenom} {user.nom}
        </Text>
        <Text style={styles.sub}>{user.filiale}</Text>
        <Text style={styles.note}>{since ? `Votre venue a été confirmée à l’entrée le ${since}. Bon événement !` : 'Votre venue a été confirmée à l’entrée. Bon événement !'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: colors.primary, borderBottomWidth: 3, borderBottomColor: colors.accent },
  headText: { color: colors.white, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  body: { alignItems: 'center', padding: 18, gap: 2 },
  name: { fontSize: 20, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 14 },
  qrBox: { padding: 10, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: '#b6b8c8', backgroundColor: colors.white },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
  foot: { alignItems: 'center', gap: 2, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: colors.border, backgroundColor: '#fafafc' },
  footTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  footText: { fontSize: 12, color: colors.muted, textTransform: 'capitalize' },
});
