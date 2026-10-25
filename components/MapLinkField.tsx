import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { extractGoogleMapsLink, googleMapsSearchUrl, mapLinkState } from '../lib/googleMapsLink';
import { pressableSx, sx } from '../lib/sx';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  /** The hotel or address typed above, for the "find it in Google Maps" shortcut. */
  placeName?: string;
  /** Inside a location picker: smaller label, the picker's own input look. */
  compact?: boolean;
};

function openUrl(url: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    return;
  }
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * Optional Google Maps link for a hotel or a street address.
 *
 * With it the driver's button opens that exact place; without it the name is
 * searched, as before. The company finds the place ("Find in Google Maps"),
 * taps Share → Copy link and pastes it here; the box says at once whether what
 * it got is a Google Maps link, so a wrong paste is caught while typing.
 */
export function MapLinkField({ value, onChangeText, placeName, compact = false }: Props) {
  const { t } = useTranslation();
  const state = mapLinkState(value);
  const link = state === 'valid' ? extractGoogleMapsLink(value) : null;
  const searchUrl = googleMapsSearchUrl(placeName);

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      <Text style={compact ? styles.labelCompact : styles.label}>{t('mapLink.label')}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        // Shared from the Google Maps app the link comes with the place's name
        // and address; keep just the link.
        onBlur={() => {
          if (link && link !== value.trim()) onChangeText(link);
        }}
        placeholder={t('mapLink.placeholder')}
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={sx(compact ? styles.inputCompact : styles.input, state === 'invalid' ? styles.inputError : null)}
      />
      {state === 'valid' ? (
        <View style={styles.row}>
          <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
          <Text style={styles.okText}>{t('mapLink.valid')}</Text>
          <Pressable
            onPress={() => {
              if (link) openUrl(link);
            }}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={styles.action}>{t('mapLink.check')}</Text>
          </Pressable>
        </View>
      ) : state === 'invalid' ? (
        <Text style={styles.error}>{t('mapLink.invalid')}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{t('mapLink.hint')}</Text>
          {searchUrl ? (
            <Pressable
              onPress={() => openUrl(searchUrl)}
              style={pressableSx(styles.searchBtn, (pressed) => pressed && styles.pressed)}
              hitSlop={6}
              accessibilityRole="link"
            >
              <Ionicons name="search" size={14} color={COLORS.goldDark} />
              <Text style={styles.action}>{t('mapLink.search')}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
  },
  wrapCompact: {
    marginTop: 10,
  },
  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  labelCompact: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  inputCompact: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  okText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  action: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.goldDark,
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.error,
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.8,
  },
});
