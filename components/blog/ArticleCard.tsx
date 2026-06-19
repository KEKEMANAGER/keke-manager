import { Link } from 'expo-router';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryLabel, type BlogLang, type BlogPost } from '../../lib/blogTypes';
import { LANDING, landingFont, sx } from '../landing/landingTheme';

type Props = {
  post: BlogPost;
  lang?: BlogLang;
};

export function ArticleCard({ post, lang = 'ka' }: Props) {
  const href = lang === 'ka' ? `/blog/${post.slug}` : `/blog/${post.slug}?lang=${lang}`;
  const imageUri = post.featuredImage.startsWith('http')
    ? post.featuredImage
    : `https://kekemanager.com${post.featuredImage}`;

  const inner = (
  <>
      <Image
        source={{ uri: imageUri }}
        style={styles.image}
        accessibilityLabel={post.title}
        {...(Platform.OS === 'web' ? { loading: 'lazy' as const } : {})}
      />
      <View style={styles.body}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{categoryLabel(post.category, lang)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={3}>
          {post.title}
        </Text>
        <Text style={styles.excerpt} numberOfLines={3}>
          {post.excerpt}
        </Text>
        <Text style={styles.meta}>
          {post.date} · {post.readingTime} min
        </Text>
      </View>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <Link href={href} asChild className="blog-article-card-link">
        <Pressable style={sx(styles.card)}>{inner}</Pressable>
      </Link>
    );
  }

  return (
    <Link href={href} asChild>
      <Pressable
        style={({ pressed }) => sx(styles.card, pressed ? styles.pressed : undefined)}
      >
        {inner}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: LANDING.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LANDING.border,
    overflow: 'hidden',
    flex: 1,
    minWidth: 280,
    maxWidth: '100%',
  },
  pressed: { opacity: 0.92 },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: LANDING.bgSoft,
  },
  body: { padding: 16 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: LANDING.accentLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeText: {
    ...landingFont({ fontSize: 11, fontWeight: '800', color: '#c47a10' }),
    textTransform: 'uppercase',
  },
  title: {
    ...landingFont({ fontSize: 18, fontWeight: '800', color: LANDING.text }),
    marginBottom: 8,
  },
  excerpt: {
    ...landingFont({ fontSize: 14, lineHeight: 20, color: LANDING.muted }),
    marginBottom: 10,
  },
  meta: {
    ...landingFont({ fontSize: 12, color: LANDING.muted }),
  },
});
