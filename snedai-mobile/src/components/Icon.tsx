import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type IconName =
  | 'calendar'
  | 'clock'
  | 'pin'
  | 'ticket'
  | 'user'
  | 'check'
  | 'chevron-right'
  | 'chevron-left'
  | 'scan'
  | 'logout'
  | 'close'
  | 'camera'
  | 'keyboard'
  | 'alert';

// Icônes au trait (style « feather »), identiques à celles du site.
function shapes(name: IconName) {
  switch (name) {
    case 'calendar':
      return (
        <>
          <Rect x="3" y="4" width="18" height="18" rx="2" />
          <Line x1="16" y1="2" x2="16" y2="6" />
          <Line x1="8" y1="2" x2="8" y2="6" />
          <Line x1="3" y1="10" x2="21" y2="10" />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="10" />
          <Polyline points="12 6 12 12 16 14" />
        </>
      );
    case 'pin':
      return (
        <>
          <Path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0Z" />
          <Circle cx="12" cy="10" r="3" />
        </>
      );
    case 'ticket':
      return (
        <>
          <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <Line x1="13" y1="5" x2="13" y2="7" />
          <Line x1="13" y1="17" x2="13" y2="19" />
          <Line x1="13" y1="11" x2="13" y2="13" />
        </>
      );
    case 'user':
      return (
        <>
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle cx="12" cy="7" r="4" />
        </>
      );
    case 'check':
      return <Polyline points="20 6 9 17 4 12" />;
    case 'chevron-right':
      return <Polyline points="9 18 15 12 9 6" />;
    case 'chevron-left':
      return <Polyline points="15 18 9 12 15 6" />;
    case 'scan':
      return (
        <>
          <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <Line x1="7" y1="12" x2="17" y2="12" />
        </>
      );
    case 'logout':
      return (
        <>
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Polyline points="16 17 21 12 16 7" />
          <Line x1="21" y1="12" x2="9" y2="12" />
        </>
      );
    case 'close':
      return (
        <>
          <Line x1="18" y1="6" x2="6" y2="18" />
          <Line x1="6" y1="6" x2="18" y2="18" />
        </>
      );
    case 'camera':
      return (
        <>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
          <Circle cx="12" cy="13" r="4" />
        </>
      );
    case 'keyboard':
      return (
        <>
          <Rect x="2" y="5" width="20" height="14" rx="2" />
          <Line x1="6" y1="9" x2="6.01" y2="9" />
          <Line x1="10" y1="9" x2="10.01" y2="9" />
          <Line x1="14" y1="9" x2="14.01" y2="9" />
          <Line x1="18" y1="9" x2="18.01" y2="9" />
          <Line x1="7" y1="15" x2="17" y2="15" />
        </>
      );
    case 'alert':
      return (
        <>
          <Circle cx="12" cy="12" r="10" />
          <Line x1="12" y1="8" x2="12" y2="12" />
          <Line x1="12" y1="16" x2="12.01" y2="16" />
        </>
      );
  }
}

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes(name)}
    </Svg>
  );
}
