import { Platform, type ViewStyle } from 'react-native';

// Charte SNEDAI : bleu marine et orange du logo (mêmes couleurs que le site).
export const colors = {
  primary: '#26246a',
  primaryDark: '#1a1950',
  primarySoft: '#eeeef6',
  accent: '#f08a46',
  accentDark: '#d9732f',
  bg: '#eef0f5',
  card: '#ffffff',
  border: '#dcdde6',
  text: '#1d1d2b',
  muted: '#62647a',
  faint: '#8a8ca0',
  ok: '#17703a',
  okBg: '#e7f4ec',
  warn: '#9a5a10',
  warnBg: '#fdf1e2',
  error: '#b42318',
  errorBg: '#fdecea',
  white: '#ffffff',
} as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

export const shadow: ViewStyle = Platform.select<ViewStyle>({
  ios: { shadowColor: '#141446', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 3 },
  default: { shadowColor: '#141446', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
}) as ViewStyle;
