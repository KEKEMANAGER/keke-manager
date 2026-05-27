import { StyleSheet, Text, View } from 'react-native';
import type { BlogFaqItem } from '../../lib/blogTypes';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  items: BlogFaqItem[];
  title: string;
};

export function FaqSection({ items, title }: Props) {
  if (!items?.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {items.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.q}>{item.question}</Text>
          <Text style={styles.a}>{item.answer}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: LANDING.border,
  },
  title: {
    ...landingFont({ fontSize: 24, fontWeight: '800', color: LANDING.text }),
    marginBottom: 16,
  },
  item: {
    marginBottom: 16,
    backgroundColor: LANDING.bgSoft,
    borderRadius: 12,
    padding: 16,
  },
  q: {
    ...landingFont({ fontSize: 16, fontWeight: '800', color: LANDING.text }),
    marginBottom: 8,
  },
  a: {
    ...landingFont({ fontSize: 15, lineHeight: 22, color: LANDING.muted }),
  },
});
