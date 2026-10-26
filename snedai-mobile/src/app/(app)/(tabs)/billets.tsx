import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventCard } from '../../../components/EventCard';
import { EmptyState } from '../../../components/Ui';
import { useEvents } from '../../../lib/events';
import { colors } from '../../../lib/theme';

export default function Billets() {
  const { actifs, termines, loaded, loading, refresh } = useEvents();
  const mine = [...actifs, ...termines].filter((e) => e.participation);
  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={refresh} tintColor={colors.primary} />}>
        <Text style={styles.title}>Mes billets</Text>
        {loaded && !mine.length ? <EmptyState icon="ticket" title="Aucun billet" text="Confirmez votre présence à un événement pour recevoir votre billet d’entrée." /> : null}
        {mine.map((e) => (
          <EventCard key={e.id} event={e} onPress={() => router.push({ pathname: '/event/[id]', params: { id: String(e.id) } })} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: colors.primary },
});
