import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { touristVoucherTabLabels } from '../lib/touristVoucherDisplay';
import type { TouristVoucherLocale } from '../lib/touristVoucherLocale';

export type VoucherMode = 'company' | 'tourist';

type Props = {
  mode: VoucherMode;
  onChange: (mode: VoucherMode) => void;
  /** When set, tab labels follow the tourist voucher language (KA/EN/RU). */
  locale?: TouristVoucherLocale;
};

export function VoucherModeTabs({ mode, onChange, locale }: Props) {
  const { t } = useTranslation();
  const tabLabels = locale ? touristVoucherTabLabels(locale) : null;
  const companyLabel = tabLabels?.company ?? t('companyVoucher.tabCompany');
  const touristLabel = tabLabels?.tourist ?? t('companyVoucher.tabTourist');

  return (
    <View style={styles.modeTabs}>
      <Pressable
        onPress={() => onChange('company')}
        style={[styles.modeTab, mode === 'company' && styles.modeTabActive]}
      >
        <Text style={[styles.modeTabText, mode === 'company' && styles.modeTabTextActive]}>
          {companyLabel}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('tourist')}
        style={[styles.modeTab, mode === 'tourist' && styles.modeTabActive]}
      >
        <Text style={[styles.modeTabText, mode === 'tourist' && styles.modeTabTextActive]}>
          {touristLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.35)',
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  modeTabText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  modeTabTextActive: { color: COLORS.black },
});
