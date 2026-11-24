import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { EventsProvider } from '../../lib/events';
import { colors } from '../../lib/theme';

export default function AppLayout() {
  return (
    <EventsProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </EventsProvider>
  );
}
