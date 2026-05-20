import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { COLORS } from '../constants/theme';

function nameInitials(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return '?';
  return n.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

type Props = {
  name: string | null | undefined;
  uri?: string | null;
  /** Diameter in px. Defaults to 48. */
  size?: number;
  style?: ViewStyle;
};

/** Round avatar: shows `uri` if set, otherwise gold-filled initials. */
export function UserAvatar({ name, uri, size = 48, style }: Props) {
  const radius = size / 2;
  const fontSize = Math.max(11, Math.round(size * 0.34));
  const trimmed = (uri ?? '').trim();
  const hasImage = trimmed.length > 0 && trimmed.startsWith('http');

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius },
        hasImage ? styles.imageWrap : styles.initials,
        style,
      ]}
    >
      {hasImage ? (
        <Image source={{ uri: trimmed }} style={{ width: size, height: size, borderRadius: radius }} />
      ) : (
        <Text style={[styles.initialsText, { fontSize }]}>{nameInitials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  imageWrap: {
    backgroundColor: COLORS.surfaceAlt,
  },
  initials: {
    backgroundColor: COLORS.gold,
  },
  initialsText: {
    color: '#0f0f0f',
    fontWeight: '800',
  },
});
