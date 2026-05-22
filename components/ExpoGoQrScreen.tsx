import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from './AppLogo';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { getDevConnectUrlFromEnv, normalizeExpoConnectUrl } from '../lib/devConnectUrl';

const STORAGE_KEY = 'keke_dev_expo_connect_url';

type Props = {
  showBackHint?: boolean;
};

export function ExpoGoQrScreen({ showBackHint }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const stored = (await AsyncStorage.getItem(STORAGE_KEY))?.trim() ?? '';
    const envUrl = getDevConnectUrlFromEnv();
    const resolved = normalizeExpoConnectUrl(stored || envUrl);
    setUrl(resolved);
    setDraft(resolved);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveUrl() {
    const next = normalizeExpoConnectUrl(draft);
    setUrl(next);
    if (next) {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <AppLogo size="auth" />
      <Text style={styles.title}>{t('devQr.title')}</Text>
      <Text style={styles.sub}>{t('devQr.subtitle')}</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.xl }} />
      ) : url ? (
        <View style={styles.qrCard}>
          <QRCode value={url} size={220} backgroundColor={COLORS.white} color={COLORS.text} />
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{t('devQr.noUrl')}</Text>
        </View>
      )}

      {url ? (
        <Text style={styles.url} selectable>
          {url}
        </Text>
      ) : null}

      <Text style={styles.sectionLabel}>{t('devQr.urlLabel')}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={t('devQr.urlPlaceholder')}
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Pressable onPress={() => void saveUrl()} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <Text style={styles.btnText}>{t('devQr.saveUrl')}</Text>
      </Pressable>

      <View style={styles.steps}>
        <Text style={styles.stepsTitle}>{t('devQr.stepsTitle')}</Text>
        <Text style={styles.step}>{t('devQr.step1')}</Text>
        <Text style={styles.step}>{t('devQr.step2')}</Text>
        <Text style={styles.step}>{t('devQr.step3')}</Text>
        <Text style={styles.step}>{t('devQr.step4')}</Text>
      </View>

      {showBackHint ? <Text style={styles.hint}>{t('devQr.backHint')}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  qrCard: {
    padding: SPACING.lg,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.white,
  },
  placeholder: {
    width: 252,
    height: 252,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  placeholderText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    fontSize: 14,
  },
  url: {
    marginTop: SPACING.md,
    fontSize: 13,
    color: COLORS.goldLight,
    textAlign: 'center',
    fontWeight: '600',
  },
  sectionLabel: {
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.grayLight,
  },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  btn: {
    alignSelf: 'stretch',
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.input,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.88,
  },
  steps: {
    alignSelf: 'stretch',
    marginTop: SPACING.xl,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  step: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 6,
    lineHeight: 18,
  },
  hint: {
    marginTop: SPACING.lg,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
