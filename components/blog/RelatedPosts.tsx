import { StyleSheet, Text, View } from 'react-native';
import type { BlogLang, BlogPost } from '../../lib/blogTypes';
import { ArticleCard } from './ArticleCard';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  posts: BlogPost[];
  title: string;
  lang?: BlogLang;
};

export function RelatedPosts({ posts, title, lang = 'ka' }: Props) {
  if (!posts.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.grid}>
        {posts.map((p) => (
          <View key={p.slug} style={styles.cell}>
            <ArticleCard post={p} lang={lang} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 32, marginBottom: 24 },
  title: {
    ...landingFont({ fontSize: 22, fontWeight: '800', color: LANDING.text }),
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  cell: {
    flexBasis: 300,
    flexGrow: 1,
    maxWidth: '100%',
  },
});
