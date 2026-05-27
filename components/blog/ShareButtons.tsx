import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SITE_URL } from '../../lib/seoMeta';
import { LANDING, landingFont } from '../landing/landingTheme';

type Props = {
  slug: string;
  title: string;
  labels: { copy: string; whatsapp: string; email: string; copied: string };
};

export function ShareButtons({ slug, title, labels }: Props) {
  const url = `${SITE_URL}/blog/${slug}`;

  async function copyLink() {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`${title}\n${url}`);
    void Linking.openURL(`https://wa.me/?text=${text}`);
  }

  function shareEmail() {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`${title}\n\n${url}`);
    void Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  }

  return (
    <View style={styles.row}>
      <Pressable onPress={() => void copyLink()} style={styles.btn}>
        <Text style={styles.btnText}>{labels.copy}</Text>
      </Pressable>
      <Pressable onPress={shareWhatsApp} style={styles.btn}>
        <Text style={styles.btnText}>{labels.whatsapp}</Text>
      </Pressable>
      <Pressable onPress={shareEmail} style={styles.btn}>
        <Text style={styles.btnText}>{labels.email}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 16,
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LANDING.border,
    backgroundColor: LANDING.white,
    justifyContent: 'center',
  },
  btnText: {
    ...landingFont({ fontSize: 14, fontWeight: '700', color: LANDING.text }),
  },
});
