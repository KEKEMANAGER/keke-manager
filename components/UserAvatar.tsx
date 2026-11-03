import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useState } from 'react';
import { COLORS } from '../constants/theme';
import { StorageImage } from './StorageImage';

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
  /**
   * Show a small copy made by Storage instead of the uploaded original (often
   * several MB) — for long lists such as the admin support inbox.
   */
  thumbnail?: boolean;
};

/** Round avatar: shows `uri` if set, otherwise gold-filled initials. */
export function UserAvatar({ name, uri, size = 48, style, thumbnail = false }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const radius = size / 2;
  const fontSize = Math.max(11, Math.round(size * 0.34));
  const trimmed = (uri ?? '').trim();
  const hasImage = !imageFailed && trimmed.length > 0 && trimmed.startsWith('http');

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius },
        hasImage ? styles.imageWrap : styles.initials,
        style,
      ]}
    >
      {hasImage && thumbnail ? (
        <StorageImage
          uri={trimmed}
          size={{ width: size * 3, height: size * 3, quality: 75 }}
          style={{ width: size, height: size, borderRadius: radius }}
          onFailed={() => setImageFailed(true)}
        />
      ) : hasImage ? (
        <Image
          source={{ uri: trimmed }}
          style={{ width: size, height: size, borderRadius: radius }}
          onError={() => setImageFailed(true)}
        />
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
