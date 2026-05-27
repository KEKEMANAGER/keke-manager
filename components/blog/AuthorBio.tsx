import { StyleSheet, Text, View } from 'react-native';
import { BLOG_AUTHOR } from '../../lib/blogTypes';
import type { BlogLang } from '../../lib/blogTypes';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  lang?: BlogLang;
};

export function AuthorBio({ lang = 'ka' }: Props) {
  return (
    <View style={styles.box}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>AK</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{BLOG_AUTHOR.name}</Text>
        <Text style={styles.role}>{BLOG_AUTHOR.title}</Text>
        <Text style={styles.bio}>{lang === 'ka' ? BLOG_AUTHOR.bioKa : BLOG_AUTHOR.bio}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: LANDING.bgSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LANDING.border,
    padding: 20,
    marginVertical: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: LANDING.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...landingFont({ fontSize: 18, fontWeight: '800', color: LANDING.text }),
  },
  body: { flex: 1 },
  name: {
    ...landingFont({ fontSize: 17, fontWeight: '800', color: LANDING.text }),
  },
  role: {
    ...landingFont({ fontSize: 13, color: LANDING.muted }),
    marginBottom: 8,
  },
  bio: {
    ...landingFont({ fontSize: 14, lineHeight: 21, color: LANDING.text }),
  },
});
