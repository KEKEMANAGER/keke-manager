import { StyleSheet, Text, View } from 'react-native';
import { BLOG_AUTHORS, BLOG_TEAM_BIO } from '../../lib/blogTypes';
import type { BlogLang } from '../../lib/blogTypes';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  lang?: BlogLang;
};

export function AuthorBio({ lang = 'ka' }: Props) {
  return (
    <View style={styles.wrap}>
      {BLOG_AUTHORS.map((author) => (
        <View key={author.name} style={styles.box}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{author.initials}</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{author.name}</Text>
            <Text style={styles.role}>{lang === 'ka' ? author.titleKa : author.title}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.bio}>{lang === 'ka' ? BLOG_TEAM_BIO.ka : BLOG_TEAM_BIO.en}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 24,
    gap: 12,
  },
  box: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: LANDING.bgSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LANDING.border,
    padding: 20,
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
  body: { flex: 1, justifyContent: 'center' },
  name: {
    ...landingFont({ fontSize: 17, fontWeight: '800', color: LANDING.text }),
  },
  role: {
    ...landingFont({ fontSize: 13, color: LANDING.muted }),
  },
  bio: {
    ...landingFont({ fontSize: 14, lineHeight: 21, color: LANDING.text }),
    backgroundColor: LANDING.bgSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LANDING.border,
    padding: 20,
  },
});
