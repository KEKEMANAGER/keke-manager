import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LANDING, landingFont, sx } from '../landing/landingTheme';

type Props = {
  title: string;
  subtitle: string;
  button: string;
  sticky?: boolean;
};

export function TryKekeCta({ title, subtitle, button, sticky }: Props) {
  const inner = (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      {Platform.OS === 'web' ? (
        <Link href="/sign-up" style={sx(styles.btn)}>
          <Text style={styles.btnText}>{button}</Text>
        </Link>
      ) : (
        <Link href="/sign-up" asChild>
          <Pressable style={styles.btn}>
            <Text style={styles.btnText}>{button}</Text>
          </Pressable>
        </Link>
      )}
    </>
  );

  if (Platform.OS === 'web' && sticky) {
    return <div className="blog-sticky-cta">{inner}</div>;
  }

  return <View style={sx(styles.box)}>{inner}</View>;
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: LANDING.accentLight,
    borderWidth: 1,
    borderColor: LANDING.accent,
    borderRadius: 16,
    padding: 20,
    marginVertical: 24,
  },
  title: {
    ...landingFont({ fontSize: 18, fontWeight: '800', color: LANDING.text }),
    marginBottom: 6,
  },
  sub: {
    ...landingFont({ fontSize: 14, lineHeight: 20, color: LANDING.muted }),
    marginBottom: 14,
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: LANDING.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    textDecorationLine: 'none',
  },
  btnText: {
    ...landingFont({ fontSize: 15, fontWeight: '800', color: LANDING.text }),
  },
});
