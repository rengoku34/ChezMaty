import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../lib/theme';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'accent' | 'outline' | 'danger' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

const palette: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary, pressed: colors.primaryDark },
  accent: { bg: colors.accent, fg: colors.white, border: colors.accent, pressed: colors.accentDark },
  outline: { bg: colors.white, fg: colors.primary, border: colors.border, pressed: colors.primarySoft },
  danger: { bg: colors.white, fg: colors.error, border: '#e9b4ae', pressed: colors.errorBg },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent', pressed: colors.primarySoft },
};

export function Button({ label, onPress, variant = 'primary', icon, loading = false, disabled = false, small = false, style }: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: pressed && !inactive ? p.pressed : p.bg, borderColor: p.border, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={p.fg} /> : null}
      <Text style={[styles.label, small && styles.labelSmall, { color: p.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  small: { minHeight: 38, paddingHorizontal: 14 },
  label: { fontSize: 16, fontWeight: '600' },
  labelSmall: { fontSize: 14 },
});
