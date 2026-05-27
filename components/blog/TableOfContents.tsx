import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BlogTocItem } from '../../lib/blogTypes';
import { LANDING, landingFont, sx } from '../landing/landingTheme';

type Props = {
  items: BlogTocItem[];
  title: string;
};

export function TableOfContents({ items, title }: Props) {
  if (!items.length) return null;

  function scrollTo(id: string) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => scrollTo(item.id)}
          style={sx(styles.item, item.level === 3 ? styles.itemNested : undefined)}
        >
          <Text style={styles.itemText}>{item.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: LANDING.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LANDING.border,
    padding: 16,
    marginBottom: 24,
  },
  title: {
    ...landingFont({ fontSize: 14, fontWeight: '800', color: LANDING.text }),
    marginBottom: 10,
  },
  item: {
    paddingVertical: 6,
    minHeight: 48,
    justifyContent: 'center',
  },
  itemNested: { paddingLeft: 12 },
  itemText: {
    ...landingFont({ fontSize: 14, color: LANDING.muted }),
  },
});
