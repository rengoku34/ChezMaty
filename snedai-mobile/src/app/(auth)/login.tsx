import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthLayout } from '../../components/AuthLayout';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Fields';
import { Banner } from '../../components/Ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return setError('Saisissez votre adresse e-mail et votre mot de passe.');
    setError(null);
    setLoading(true);
    try {
      const result = await api.login(email.trim(), password);
      await signIn(result.token, result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Connexion" subtitle="Retrouvez les événements de SNEDAI et votre billet d’entrée.">
      {error ? <Banner>{error}</Banner> : null}
      <TextField label="Adresse e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
      <TextField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
      <Button label={loading ? 'Connexion…' : 'Se connecter'} onPress={submit} loading={loading} />
      {loading ? <Text style={styles.wait}>Le premier démarrage du serveur peut prendre jusqu’à une minute.</Text> : null}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Pas encore de compte ?</Text>
        <Link href="/signup" style={styles.link}>
          Créer un compte
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  wait: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  footerText: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
