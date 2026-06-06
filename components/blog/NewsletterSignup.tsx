import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { BlogLang } from '../../lib/blogTypes';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  title: string;
  subtitle: string;
  lang?: BlogLang;
};

export function NewsletterSignup({ title, subtitle, lang = 'ka' }: Props) {
  const [email, setEmail] = useState('');

  function onSubmit() {
    const subject = encodeURIComponent('KEKE Manager Blog Newsletter');
    const body = encodeURIComponent(`Email: ${email}\nLanguage: ${lang}`);
    void Linking.openURL(`mailto:info@kekemanager.com?subject=${subject}&body=${body}`);
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <View style={styles.row}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={LANDING.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />
        <Pressable onPress={onSubmit} style={styles.btn}>
          <Text style={styles.btnText}>
            {lang === 'ka' ? 'გამოწერა' : lang === 'ru' ? 'Подписаться' : 'Subscribe'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: LANDING.dark,
    borderRadius: 16,
    padding: 24,
    marginVertical: 24,
  },
  title: {
    ...landingFont({ fontSize: 20, fontWeight: '800', color: LANDING.white }),
    marginBottom: 8,
  },
  sub: {
    ...landingFont({ fontSize: 14, lineHeight: 20, color: '#ccc' }),
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 200,
    backgroundColor: LANDING.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...landingFont({ fontSize: 15, color: LANDING.text }),
  },
  btn: {
    backgroundColor: LANDING.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  btnText: {
    ...landingFont({ fontSize: 15, fontWeight: '800', color: LANDING.text }),
  },
});
