import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Countdown } from '../../../components/Countdown';
import { EventCard, EventCover } from '../../../components/EventCard';
import { Banner, EmptyState } from '../../../components/Ui';
import { useAuth } from '../../../lib/auth';
import { useEvents } from '../../../lib/events';
import { colors, radius } from '../../../lib/theme';

export default function Evenements() {
  const { user } = useAuth();
  const { actifs, termines, prochainId, loaded, loading, error, refresh } = useEvents();
  const prochain = actifs.find((e) => e.id === prochainId) ?? null;
  const open = (id: number) => router.push({ pathname: '/event/[id]', params: { id: String(id) } });

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={refresh} tintColor={colors.primary} />}>
        <Text style={styles.hello}>Bonjour {user?.prenom}</Text>
        <Text style={styles.sub}>Les événements de SNEDAI</Text>
        {error ? <Banner>{error}</Banner> : null}

        {prochain?.debut && !prochain.enCours ? (
          <View style={styles.hero}>
            <EventCover event={prochain} height={120} />
            <View style={styles.heroBody}>
              <Text style={styles.heroKicker}>PROCHAIN ÉVÉNEMENT</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{prochain.titre}</Text>
              <Countdown target={prochain.debut} onDone={refresh} />
              <Text style={styles.link} onPress={() => open(prochain.id)}>Voir le billet et les détails</Text>
            </View>
          </View>
        ) : null}

        {loaded && !actifs.length ? <EmptyState icon="calendar" title="Aucun événement pour le moment" text="Vous serez prévenu(e) par e-mail dès qu’un événement sera publié." /> : null}
        {actifs.map((e) => (
          <EventCard key={e.id} event={e} onPress={() => open(e.id)} />
        ))}

        {termines.length ? <Text style={styles.section}>Événements passés</Text> : null}
        {termines.map((e) => (
          <EventCard key={e.id} event={e} onPress={() => open(e.id)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  hello: { fontSize: 26, fontWeight: '700', color: colors.primary, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: colors.muted, marginTop: -10 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, overflow: 'hidden' },
  heroBody: { padding: 16, gap: 10 },
  heroKicker: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  heroTitle: { color: colors.white, fontSize: 20, fontWeight: '700' },
  link: { color: colors.white, fontWeight: '700', fontSize: 14, textDecorationLine: 'underline' },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 10 },
});
