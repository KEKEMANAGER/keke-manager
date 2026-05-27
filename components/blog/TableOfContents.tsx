import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BlogTocItem } from '../../lib/blogTypes';
import { LANDING, landingFont, sx } from '../landing/landingTheme';

type Props = {
  items: BlogTocItem[];
  title: string;
  /** Sidebar on desktop; collapsible block above article on smaller screens. */
  variant?: 'sidebar' | 'inline';
};

export function TableOfContents({ items, title, variant = 'sidebar' }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!items.length) return null;

  function scrollTo(id: string) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (variant === 'inline') {
      setExpanded(false);
    }
  }

  const list = items.map((item) => (
    <Pressable
      key={item.id}
      onPress={() => scrollTo(item.id)}
      style={sx(styles.item, item.level === 3 ? styles.itemNested : undefined)}
    >
      <Text style={styles.itemText}>{item.text}</Text>
    </Pressable>
  ));

  if (variant === 'inline') {
    return (
      <View style={styles.box}>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={sx(styles.title, styles.titleInToggle)}>{title}</Text>
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </Pressable>
        {expanded ? <View style={styles.list}>{list}</View> : null}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={sx(styles.title, styles.titleHeader)}>{title}</Text>
      <View style={styles.list}>{list}</View>
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
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  title: {
    ...landingFont({ fontSize: 14, fontWeight: '800', color: LANDING.text }),
  },
  titleInToggle: { flex: 1 },
  titleHeader: { marginBottom: 10 },
  chevron: {
    ...landingFont({ fontSize: 12, color: LANDING.muted }),
    marginLeft: 8,
  },
  list: {
    marginTop: 4,
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
