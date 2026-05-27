import { Image, StyleSheet, Text, View } from 'react-native';
import { categoryLabel } from '../../lib/blog';
import type { BlogLang, BlogPost } from '../../lib/blogTypes';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  post: BlogPost;
  lang?: BlogLang;
};

export function ArticleHero({ post, lang = 'ka' }: Props) {
  const imageUri = post.featuredImage.startsWith('http')
    ? post.featuredImage
    : `https://kekemanager.com${post.featuredImage}`;

  return (
    <View style={styles.wrap}>
      <Image source={{ uri: imageUri }} style={styles.image} accessibilityLabel={post.title} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{categoryLabel(post.category, lang)}</Text>
      </View>
      <Text style={styles.title}>{post.title}</Text>
      <Text style={styles.meta}>
        {post.author} · {post.date} · {post.readingTime} min
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: LANDING.bgSoft,
    marginBottom: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: LANDING.accentLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeText: {
    ...landingFont({ fontSize: 12, fontWeight: '800', color: '#c47a10' }),
  },
  title: {
    ...landingFont({ fontSize: 32, fontWeight: '800', color: LANDING.text, lineHeight: 38 }),
    marginBottom: 10,
  },
  meta: {
    ...landingFont({ fontSize: 14, color: LANDING.muted }),
  },
});
