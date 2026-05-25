import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../../../components/AuthInput';
import { APP_HEADER_BODY_HEIGHT } from '../../../constants/layout';
import { COLORS, RADIUS, SPACING } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import type { BookingRow } from '../../../lib/bookings';
import {
  canCompanyEditBooking,
  fetchBookingForCompanyEdit,
  updateBookingByCompany,
} from '../../../lib/bookingUpdate';
import { showErrorAlert, showValidationAlert } from '../../../lib/validation';

export default function EditBookingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [dateDisplay, setDateDisplay] = useState('');
  const [passengers, setPassengers] = useState('');
  const [priceGel, setPriceGel] = useState('');
  const [signText, setSignText] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    const { data, error } = await fetchBookingForCompanyEdit(String(id), user.id);
    setLoading(false);
    if (error || !data) {
      showErrorAlert(error?.message ?? t('editBooking.notFound'));
      router.back();
      return;
    }
    setBooking(data);
    setFromLoc(data.from_location ?? '');
    setToLoc(data.to_location ?? '');
    setDateDisplay(data.date_display ?? '');
    setPassengers(String(data.passengers ?? 1));
    setPriceGel(String(data.price_gel ?? ''));
    setSignText(data.sign_text ?? '');
    setFlightNumber(data.flight_number ?? '');
    setComment(data.comment ?? '');
  }, [id, user?.id, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (!user?.id || !booking) return;
    const gate = canCompanyEditBooking(booking.status);
    if (!gate.allowed) {
      showValidationAlert(t('editBooking.notAllowed'));
      return;
    }
    if (gate.warn) {
      Alert.alert(t('editBooking.warnTitle'), t('editBooking.warnInProgress'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.save'), onPress: () => void submit() },
      ]);
      return;
    }
    await submit();
  }

  async function submit() {
    if (!user?.id || !booking) return;
    setSaving(true);
    const pax = parseInt(passengers, 10);
    const price = parseFloat(priceGel.replace(',', '.'));
    const { error } = await updateBookingByCompany(
      booking.id,
      user.id,
      {
        from_location: fromLoc.trim() || null,
        to_location: toLoc.trim() || null,
        date_display: dateDisplay.trim() || null,
        passengers: Number.isFinite(pax) && pax > 0 ? pax : booking.passengers,
        price_gel: Number.isFinite(price) ? price : booking.price_gel,
        sign_text: signText.trim() || null,
        flight_number:
          booking.kind === 'transfer' ? flightNumber.trim() || null : booking.flight_number,
        comment: comment.trim() || null,
      },
      reason,
    );
    setSaving(false);
    if (error) {
      showErrorAlert(error.message);
      return;
    }
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
    >
      <Text style={styles.title}>{t('editBooking.title')}</Text>
      <Text style={styles.sub}>{t('editBooking.subtitle')}</Text>

      <AuthInput label={t('editBooking.from')} value={fromLoc} onChangeText={setFromLoc} />
      <AuthInput label={t('editBooking.to')} value={toLoc} onChangeText={setToLoc} />
      <AuthInput label={t('editBooking.date')} value={dateDisplay} onChangeText={setDateDisplay} />
      <AuthInput
        label={t('editBooking.passengers')}
        value={passengers}
        onChangeText={setPassengers}
        keyboardType="number-pad"
      />
      <AuthInput
        label={t('editBooking.price')}
        value={priceGel}
        onChangeText={setPriceGel}
        keyboardType="decimal-pad"
      />
      <AuthInput label={t('editBooking.signText')} value={signText} onChangeText={setSignText} />
      {booking?.kind === 'transfer' ? (
        <AuthInput
          label={t('newBooking.flightNumber')}
          value={flightNumber}
          onChangeText={setFlightNumber}
          autoCapitalize="characters"
          placeholder={t('newBooking.flightNumberPlaceholder')}
        />
      ) : null}
      <AuthInput
        label={t('editBooking.comment')}
        value={comment}
        onChangeText={setComment}
        multiline
      />
      <AuthInput
        label={t('editBooking.reason')}
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder={t('editBooking.reasonHint')}
      />

      <Pressable
        onPress={() => void onSave()}
        disabled={saving}
        style={({ pressed }) => [styles.saveBtn, (pressed || saving) && styles.pressed]}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.saveBtnText}>{t('editBooking.save')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: SPACING.md },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  saveBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.gold,
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '800', fontSize: 16, color: COLORS.black },
  pressed: { opacity: 0.88 },
});
