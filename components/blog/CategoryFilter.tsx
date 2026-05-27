import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { BLOG_CATEGORIES } from '../../lib/blogTypes';
import type { BlogCategoryId, BlogLang } from '../../lib/blogTypes';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  active: BlogCategoryId | 'all';
  onChange: (id: BlogCategoryId | 'all') => void;
  lang?: BlogLang;
};

const FILTERS: { id: BlogCategoryId | 'all'; labelKa: string; labelEn: string }[] = [
  { id: 'all', labelKa: 'ყველა', labelEn: 'All' },
  ...BLOG_CATEGORIES.map((c) => ({
    id: c.id,
    labelKa: c.nameKa,
    labelEn: c.name,
  })),
];

export function CategoryFilter({ active, onChange, lang = 'ka' }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {FILTERS.map((f) => {
        const on = active === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {lang === 'ka' ? f.labelKa : f.labelEn}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LANDING.border,
    backgroundColor: LANDING.white,
  },
  chipOn: {
    backgroundColor: LANDING.accent,
    borderColor: LANDING.accent,
  },
  chipText: {
    ...landingFont({ fontSize: 13, fontWeight: '600', color: LANDING.text }),
  },
  chipTextOn: {
    color: LANDING.text,
    fontWeight: '800',
  },
});
