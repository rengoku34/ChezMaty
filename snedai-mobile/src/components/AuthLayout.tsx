import { type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../lib/theme';

// Écrans de connexion et d'inscription : bandeau marine avec le logo, puis le formulaire.
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <SafeAreaView edges={['top']} style={styles.hero}>
          <Image source={require('../../assets/logo.jpg')} style={styles.logo} resizeMode="contain" accessibilityLabel="SNEDAI" />
          <Text style={styles.appName}>Événements SNEDAI</Text>
        </SafeAreaView>
        <View style={styles.accentBar} />
        <View style={styles.form}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.card },
  scroll: { flexGrow: 1 },
  hero: { backgroundColor: colors.primary, alignItems: 'center', paddingTop: 24, paddingBottom: 28, paddingHorizontal: 24, gap: 12 },
  logo: { width: 170, height: 66, backgroundColor: colors.white, borderRadius: radius.md },
  appName: { color: colors.white, fontSize: 18, fontWeight: '600' },
  accentBar: { height: 4, backgroundColor: colors.accent },
  form: { padding: 24, gap: 14 },
  title: { fontSize: 26, fontWeight: '700', color: colors.primary, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: -8, marginBottom: 4, lineHeight: 20 },
});
