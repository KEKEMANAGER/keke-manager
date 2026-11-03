import { Image, View, type ImageProps, type StyleProp, type ViewStyle } from 'react-native';
import { useViewableDocumentUri } from '../lib/documentStorage';
import { isPublicStorageUrl, type StorageImageSize } from '../lib/storageImage';
import { StorageImage } from './StorageImage';

type Props = Omit<ImageProps, 'source'> & {
  /** A stored document address, a public photo link or a local file. */
  uri: string | null | undefined;
  /**
   * Show a copy of this size made by Storage instead of the original — for
   * public photos only; a private document is always shown as it is.
   */
  size?: StorageImageSize;
};

/**
 * An <Image> for a driver's document. A private document is opened through a
 * short-lived signed link (lib/documentStorage.ts); anything else is shown as
 * it is, so this can stand wherever a document or an ordinary photo may appear.
 */
export function DocumentImage({ uri, style, size, ...rest }: Props) {
  const viewable = useViewableDocumentUri(uri);
  if (!viewable) return <View style={style as StyleProp<ViewStyle>} />;
  if (size && isPublicStorageUrl(viewable)) {
    return (
      <StorageImage
        uri={viewable}
        size={size}
        style={style}
        resizeMode={rest.resizeMode === 'contain' ? 'contain' : 'cover'}
        onFailed={() => (rest.onError as (() => void) | undefined)?.()}
      />
    );
  }
  return <Image {...rest} style={style} source={{ uri: viewable }} />;
}
