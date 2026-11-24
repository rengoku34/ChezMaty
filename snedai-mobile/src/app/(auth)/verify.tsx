import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthLayout } from '../../components/AuthLayout';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, radius } from '../../lib/theme';

export default function Verify() {
  const { signupId, email, delay } = useLocalSearchParams<{ signupId: string; email: string; delay?: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(Number(delay) || 60);

  // Décompte avant de pouvoir demander un nouveau code.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function submit() {
    if (code.replace(/\D/g, '').length !== 6) return setError('Saisissez le code à 6 chiffres reçu par e-mail.');
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const result = await api.verify(String(signupId), code);
      await signIn(result.token, result.user);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'signup_expired') setExpired(true);
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const r = await api.resend(String(signupId));
      setWait(r.resendInSeconds);
      setInfo('Un nouveau code vient de vous être envoyé.');
    } catch (e) {
      if (e instanceof ApiError && typeof e.data?.retryInSeconds === 'number') setWait(e.data.retryInSeconds);
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    }
  }

  return (
    <AuthLayout title="Confirmez votre adresse" subtitle={`Nous avons envoyé un code à 6 chiffres à ${email}. Regardez aussi dans les courriers indésirables.`}>
      {error ? <Banner>{error}</Banner> : null}
      {info ? <Banner kind="success">{info}</Banner> : null}
      <View style={styles.group}>
        <Text style={styles.label}>Code de confirmation</Text>
        <TextInput
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="000000"
          placeholderTextColor={colors.faint}
          style={styles.code}
          onSubmitEditing={submit}
        />
      </View>
      {expired ? (
        <Button label="Recommencer l’inscription" onPress={() => router.replace('/signup')} />
      ) : (
        <>
          <Button label="Confirmer et créer mon compte" onPress={submit} loading={loading} />
          <Button label={wait > 0 ? `Renvoyer un code (${wait} s)` : 'Renvoyer un code'} onPress={resend} variant="ghost" disabled={wait > 0} />
          <Button label="Modifier mes informations" onPress={() => router.back()} variant="ghost" />
        </>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  code: { minHeight: 60, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, textAlign: 'center', fontSize: 30, letterSpacing: 10, fontWeight: '700', color: colors.primary, backgroundColor: colors.white },
});
