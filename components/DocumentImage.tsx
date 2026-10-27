import { Image, View, type ImageProps, type StyleProp, type ViewStyle } from 'react-native';
import { useViewableDocumentUri } from '../lib/documentStorage';

type Props = Omit<ImageProps, 'source'> & {
  /** A stored document address, a public photo link or a local file. */
  uri: string | null | undefined;
};

/**
 * An <Image> for a driver's document. A private document is opened through a
 * short-lived signed link (lib/documentStorage.ts); anything else is shown as
 * it is, so this can stand wherever a document or an ordinary photo may appear.
 */
export function DocumentImage({ uri, style, ...rest }: Props) {
  const viewable = useViewableDocumentUri(uri);
  if (!viewable) return <View style={style as StyleProp<ViewStyle>} />;
  return <Image {...rest} style={style} source={{ uri: viewable }} />;
}
