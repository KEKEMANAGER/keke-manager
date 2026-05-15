import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants/theme';
import { LANGUAGES, persistLanguage, type AppLanguage } from '../src/lib/i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language?.split('-')[0] ?? 'ka') as AppLanguage;

  return (
    <View style={styles.row}>
      {LANGUAGES.map((lang, index) => {
        const active = current === lang.code;
        return (
          <View key={lang.code} style={styles.itemWrap}>
            {index > 0 ? <Text style={styles.sep}>|</Text> : null}
            <Pressable
              onPress={() => {
                void persistLanguage(lang.code);
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={lang.label}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{lang.label}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  itemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sep: {
    color: COLORS.border,
    fontSize: 11,
    marginHorizontal: 4,
    fontWeight: '400',
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  labelActive: {
    color: COLORS.gold,
    fontWeight: '700',
  },
});
