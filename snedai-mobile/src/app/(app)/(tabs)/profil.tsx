import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../components/Button';
import { Avatar, confirmAction } from '../../../components/Ui';
import { useAuth } from '../../../lib/auth';
import { colors, radius } from '../../../lib/theme';

const roles = { admin: 'Administrateur', agent: 'Agent d’accueil', employe: 'Employé(e)' } as const;

export default function Profil() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Avatar user={user} />
          <Text style={styles.name}>{user.prenom} {user.nom}</Text>
          <Text style={styles.role}>{roles[user.role]}</Text>
        </View>
        <View style={styles.card}>
          <Row label="Filiale" value={user.filiale} />
          <Row label="Adresse e-mail" value={user.email} />
        </View>
        {user.role === 'admin' ? <Text style={styles.note}>La publication et le suivi des événements se font depuis le site web d’administration.</Text> : null}
        <Button label="Se déconnecter" icon="logout" variant="danger" onPress={() => confirmAction('Se déconnecter', 'Voulez-vous vraiment vous déconnecter ?', 'Se déconnecter', signOut)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'stretch' },
  name: { fontSize: 20, fontWeight: '700', color: colors.primary },
  role: { fontSize: 13, color: colors.accentDark, fontWeight: '700' },
  row: { gap: 2 },
  label: { fontSize: 12, color: colors.muted },
  value: { fontSize: 15, color: colors.text, fontWeight: '600' },
  note: { fontSize: 13, color: colors.muted, lineHeight: 19 },
});
