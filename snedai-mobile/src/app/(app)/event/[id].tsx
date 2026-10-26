import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../components/Button';
import { EventCover } from '../../../components/EventCard';
import { Icon } from '../../../components/Icon';
import { Ticket, ValidatedTicket } from '../../../components/Ticket';
import { Banner, ScreenTitle, confirmAction } from '../../../components/Ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useEvents } from '../../../lib/events';
import { colors, radius } from '../../../lib/theme';
import type { EventDetail } from '../../../lib/types';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { refresh } = useEvents();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.event(String(id)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(kind: 'participer' | 'annuler') {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const next = await api[kind](String(id));
      setDetail(next);
      if (kind === 'participer') setInfo(next.emailed ? 'Présence confirmée. Votre billet vous a aussi été envoyé par e-mail.' : 'Présence confirmée. Voici votre billet.');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  const event = detail?.event;
  const part = event?.participation;
  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScreenTitle title={event?.titre ?? 'Événement'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/evenements'))} />
      {!event ? (
        <View style={styles.center}>{error ? <Banner>{error}</Banner> : <ActivityIndicator color={colors.primary} />}</View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        >
          <View style={styles.cover}><EventCover event={event} height={180} /></View>
          <Text style={styles.title}>{event.titre}</Text>
          {error ? <Banner>{error}</Banner> : null}
          {info ? <Banner kind="success">{info}</Banner> : null}
          <View style={styles.infos}>
            <Info icon="calendar" text={event.date} />
            {event.heures ? <Info icon="clock" text={event.heures} /> : null}
            {event.lieu ? <Info icon="pin" text={event.lieu} /> : null}
          </View>

          {user && event.termine ? (
            <Banner kind="info">{part?.present ? 'Cet événement est terminé. Votre présence a été validée.' : 'Cet événement est terminé.'}</Banner>
          ) : user && part?.present ? (
            <ValidatedTicket user={user} since={part.scanneLe} />
          ) : user && detail.billet ? (
            <>
              <Ticket user={user} event={event} qr={detail.billet.qr} />
              <Text style={styles.hint}>Présentez ce code à l’agent d’accueil à l’entrée.</Text>
              {detail.agenda ? (
                <View style={styles.row}>
                  <Button small variant="outline" label="Google Agenda" onPress={() => Linking.openURL(detail.agenda!.google)} style={styles.flex} />
                  <Button small variant="outline" label="Outlook" onPress={() => Linking.openURL(detail.agenda!.outlook)} style={styles.flex} />
                </View>
              ) : null}
              <Button variant="danger" label="Je ne viendrai finalement pas" loading={busy} onPress={() => confirmAction('Annuler ma présence', 'Votre billet sera supprimé. Confirmer ?', 'Annuler ma présence', () => act('annuler'))} />
            </>
          ) : (
            <Button variant="accent" icon="check" label="Je serai présent(e)" loading={busy} onPress={() => act('participer')} />
          )}

          {event.description ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>À propos</Text>
              <Text style={styles.desc}>{event.description}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Info({ icon, text }: { icon: 'calendar' | 'clock' | 'pin'; text: string }) {
  return (
    <View style={styles.info}>
      <Icon name={icon} size={18} color={colors.accentDark} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, padding: 16, justifyContent: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  cover: { borderRadius: radius.lg, overflow: 'hidden' },
  title: { fontSize: 24, fontWeight: '700', color: colors.primary, letterSpacing: -0.3 },
  infos: { gap: 8 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  infoText: { fontSize: 15, color: colors.text, flex: 1 },
  hint: { textAlign: 'center', color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  desc: { fontSize: 15, lineHeight: 22, color: colors.text },
});
