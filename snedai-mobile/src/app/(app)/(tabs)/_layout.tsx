import { Tabs } from 'expo-router/js-tabs';
import { Icon, type IconName } from '../../../components/Icon';
import { useAuth } from '../../../lib/auth';
import { colors } from '../../../lib/theme';

const icon = (name: IconName) =>
  function TabIcon({ color }: { color: unknown }) {
    return <Icon name={name} size={24} color={String(color)} />;
  };

export default function TabsLayout() {
  const { user } = useAuth();
  const canScan = user?.role === 'agent' || user?.role === 'admin';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="evenements" options={{ title: 'Événements', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="billets" options={{ title: 'Mes billets', tabBarIcon: icon('ticket') }} />
      <Tabs.Screen name="scanner" options={{ title: 'Scanner', tabBarIcon: icon('scan'), href: canScan ? undefined : null }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
