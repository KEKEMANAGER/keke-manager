import { Platform, StyleSheet, Text, View } from 'react-native';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  html: string;
};

/** Renders pre-built HTML from blog build script (web). */
export function BlogMarkdownBody({ html }: Props) {
  if (Platform.OS === 'web') {
    return (
      <div
        className="blog-article-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackText}>{plain.slice(0, 2000)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { paddingVertical: 8 },
  fallbackText: {
    ...landingFont({ fontSize: 16, lineHeight: 26, color: LANDING.text }),
  },
});
