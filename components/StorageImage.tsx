import { createElement, useState } from 'react';
import { Image, Platform, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { storageImageUrl, type StorageImageSize } from '../lib/storageImage';

type Props = {
  /** The stored photo address (users.avatar_url, vehicles.photo_front, …). */
  uri: string | null | undefined;
  /** The size it is shown at, in pixels, already allowing for sharp screens. */
  size: StorageImageSize;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  /** Neither the small copy nor the original could be shown. */
  onFailed?: () => void;
};

/**
 * A photo from Storage shown as a copy made for its place on screen, not the
 * original from the phone (see lib/storageImage.ts). On the web it is loaded
 * only when it scrolls near the screen, so a long list does not fetch every
 * photo at once. Should Storage ever fail to make the copy, the original is
 * shown instead — slower, never missing.
 */
export function StorageImage({ uri, size, style, resizeMode = 'cover', onFailed }: Props) {
  const original = (uri ?? '').trim() || null;
  const small = storageImageUrl(original, { ...size, resize: size.resize ?? resizeMode });
  // The address that failed to load; a new photo starts over with its small copy.
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed && failed === small ? original : small;

  const onError = () => {
    if (src === small && small !== original) setFailed(small);
    else onFailed?.();
  };

  if (!src) return <View style={style as StyleProp<ViewStyle>} />;

  if (Platform.OS === 'web') {
    return (
      <View style={[style as StyleProp<ViewStyle>, { overflow: 'hidden' }]}>
        {createElement('img', {
          key: src,
          src,
          alt: '',
          loading: 'lazy',
          decoding: 'async',
          draggable: false,
          onError,
          style: { width: '100%', height: '100%', objectFit: resizeMode, display: 'block' },
        })}
      </View>
    );
  }
  return <Image key={src} source={{ uri: src }} style={style} resizeMode={resizeMode} onError={onError} />;
}
