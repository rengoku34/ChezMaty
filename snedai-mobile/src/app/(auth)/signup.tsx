import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthLayout } from '../../components/AuthLayout';
import { Button } from '../../components/Button';
import { SelectField, TextField } from '../../components/Fields';
import { Banner } from '../../components/Ui';
import { api } from '../../lib/api';
import { colors } from '../../lib/theme';

export default function Signup() {
  const [form, setForm] = useState({ nom: '', prenom: '', filiale: '', email: '', password: '', confirmation: '' });
  const [filiales, setFiliales] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    api.config().then((c) => setFiliales(c.filiales)).catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const start = await api.signup({ ...form, nom: form.nom.trim(), prenom: form.prenom.trim(), filiale: form.filiale.trim(), email: form.email.trim() });
      router.push({ pathname: '/verify', params: { signupId: start.signupId, email: start.email, delay: String(start.resendInSeconds) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Créer un compte" subtitle="Votre adresse e-mail sera confirmée par un code envoyé par e-mail.">
      {error ? <Banner>{error}</Banner> : null}
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField label="Nom" value={form.nom} onChangeText={set('nom')} autoCapitalize="words" autoComplete="family-name" />
        </View>
        <View style={styles.half}>
          <TextField label="Prénom" value={form.prenom} onChangeText={set('prenom')} autoCapitalize="words" autoComplete="given-name" />
        </View>
      </View>
      {filiales.length ? (
        <SelectField label="Filiale" value={form.filiale} options={filiales} onChange={set('filiale')} />
      ) : (
        <TextField label="Filiale" value={form.filiale} onChangeText={set('filiale')} autoCapitalize="words" />
      )}
      <TextField label="Adresse e-mail" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
      <TextField label="Mot de passe du site" value={form.password} onChangeText={set('password')} secureTextEntry autoCapitalize="none" autoComplete="new-password" hint="8 caractères minimum, avec une lettre et un chiffre. Ce n’est pas le mot de passe de votre messagerie." />
      <TextField label="Confirmation du mot de passe" value={form.confirmation} onChangeText={set('confirmation')} secureTextEntry autoCapitalize="none" autoComplete="new-password" returnKeyType="go" onSubmitEditing={submit} />
      <Button label="Recevoir mon code" onPress={submit} loading={loading} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Déjà un compte ?</Text>
        <Link href="/login" style={styles.link}>
          Se connecter
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  footerText: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
