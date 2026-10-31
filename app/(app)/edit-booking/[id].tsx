import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../../../components/AuthInput';
import { LocationPicker } from '../../../components/LocationPicker';
import { PickupSignLogoField } from '../../../components/PickupSignLogoField';
import { APP_HEADER_BODY_HEIGHT } from '../../../constants/layout';
import { COLORS, RADIUS, SPACING } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { isTransferKind, type BookingRow } from '../../../lib/bookings';
import {
  canCompanyEditBooking,
  fetchBookingForCompanyEdit,
  updateBookingByCompany,
} from '../../../lib/bookingUpdate';
import {
  emptyLocationValue,
  locationMapLinkIsInvalid,
  locationValueFromStored,
  persistLocationFields,
  persistLocationLink,
  type LocationValue,
} from '../../../lib/bookingLocations';
import { uploadPickupSignLogo, type PickupSignLogoFile } from '../../../lib/pickupSignLogo';
import { showErrorAlert, showValidationAlert } from '../../../lib/validation';
import { companyCanCancelBooking } from '../../../lib/companyCancel';
import { useAndroidRouterBack } from '../../../hooks/useAndroidRouterBack';
import { useCompanyCancelBooking } from '../../../hooks/useCompanyCancelBooking';

export default function EditBookingScreen() {
  const { t } = useTranslation();
  useAndroidRouterBack();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [fromLoc, setFromLoc] = useState<LocationValue>(() => emptyLocationValue());
  const [toLoc, setToLoc] = useState<LocationValue>(() => emptyLocationValue());
  const [dateDisplay, setDateDisplay] = useState('');
  const [passengers, setPassengers] = useState('');
  const [priceGel, setPriceGel] = useState('');
  const [signText, setSignText] = useState('');
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  // The sign file: a new one replaces the old on save; "remove" clears it.
  const [signFile, setSignFile] = useState<PickupSignLogoFile | null>(null);
  const [removeSign, setRemoveSign] = useState(false);
  const [flightNumber, setFlightNumber] = useState('');
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    try {
      const { data, error } = await fetchBookingForCompanyEdit(String(id), user.id);
      if (error || !data) {
        showErrorAlert(error?.message ?? t('editBooking.notFound'));
        router.back();
        return;
      }
      setBooking(data);
      setFromLoc(
        locationValueFromStored(data.from_location, data.from_location_type, data.from_location_link),
      );
      setToLoc(locationValueFromStored(data.to_location, data.to_location_type, data.to_location_link));
      setDateDisplay(data.date_display ?? '');
      setPassengers(String(data.passengers ?? 1));
      setPriceGel(String(data.price_gel ?? ''));
      setSignText(data.sign_text ?? '');
      setPassengerName(data.passenger_name ?? '');
      setPassengerPhone(data.passenger_phone ?? '');
      setSignFile(null);
      setRemoveSign(false);
      setFlightNumber(data.flight_number ?? '');
      setComment(data.comment ?? '');
    } catch (e) {
      showErrorAlert(e instanceof Error ? e.message : t('common.error'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // cancelled, or found already cancelled / finished / under way: back to the list
  const leaveAfterCancel = useCallback(() => {
    router.back();
  }, [router]);
  const { cancellingId, requestCancel } = useCompanyCancelBooking(leaveAfterCancel);

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

    const fromP = persistLocationFields(fromLoc);
    const toP = persistLocationFields(toLoc);

    if (isTransferKind(booking.kind)) {
      if (!fromP.name) {
        showValidationAlert(t('newBooking.validation.locationFrom'));
        return;
      }
      if (!toP.name) {
        showValidationAlert(t('newBooking.validation.locationTo'));
        return;
      }
      if (locationMapLinkIsInvalid(fromLoc) || locationMapLinkIsInvalid(toLoc)) {
        showValidationAlert(t('newBooking.validation.mapLink'));
        return;
      }
    }

    setSaving(true);

    // A new sign file goes up first, so the booking only ever points at a file that exists.
    let signUrl: string | null | undefined;
    if (signFile) {
      const { url, error: upErr } = await uploadPickupSignLogo(
        booking.company_id || user.id,
        booking.id,
        signFile,
      );
      if (upErr || !url) {
        setSaving(false);
        const key = upErr?.message ?? '';
        showErrorAlert(
          key === 'pickupSignLogo.invalidType' || key === 'pickupSignLogo.tooLarge'
            ? t(`newBooking.${key}`)
            : t('newBooking.pickupSignLogo.uploadFailed'),
        );
        return;
      }
      signUrl = url;
    } else if (removeSign) {
      signUrl = null;
    }

    const pax = parseInt(passengers, 10);
    const price = parseFloat(priceGel.replace(',', '.'));
    const isGroupMaster = booking.is_group_master === true;
    const { error } = await updateBookingByCompany(
      booking.id,
      user.id,
      {
        from_location: fromP.name,
        from_location_type: fromP.type,
        to_location: toP.name,
        to_location_type: toP.type,
        // Links are edited only where the pickers are shown (transfers).
        ...(isTransferKind(booking.kind)
          ? {
              from_location_link: persistLocationLink(fromLoc),
              to_location_link: persistLocationLink(toLoc),
            }
          : {}),
        date_display: dateDisplay.trim() || null,
        ...(isGroupMaster
          ? {}
          : {
              passengers: Number.isFinite(pax) && pax > 0 ? pax : booking.passengers,
              price_gel: Number.isFinite(price) ? price : booking.price_gel,
            }),
        sign_text: signText.trim() || null,
        passenger_name: passengerName.trim() || null,
        passenger_phone: passengerPhone.trim() || null,
        ...(signUrl !== undefined ? { pickup_sign_logo_url: signUrl } : {}),
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

  if (!booking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  const showLocationPickers = isTransferKind(booking.kind);
  const currentSignUrl = booking.pickup_sign_logo_url?.trim() || '';
  const currentSignIsPdf = /\.pdf(\?|$)/i.test(currentSignUrl);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
    >
      <Text style={styles.title}>{t('editBooking.title')}</Text>
      <Text style={styles.sub}>{t('editBooking.subtitle')}</Text>

      {booking.is_group_master ? (
        <View style={styles.masterBanner}>
          <Text style={styles.masterBannerTitle}>{t('editBooking.masterBannerTitle')}</Text>
          <Text style={styles.masterBannerText}>{t('editBooking.masterBannerBody')}</Text>
        </View>
      ) : null}

      {showLocationPickers ? (
        <>
          <LocationPicker
            label={t('newBooking.form.pickupLocation')}
            value={fromLoc}
            onChange={setFromLoc}
            showMapLink
          />
          <LocationPicker
            label={t('newBooking.form.dropoffLocation')}
            value={toLoc}
            onChange={setToLoc}
            showMapLink
          />
        </>
      ) : (
        <>
          <AuthInput
            label={t('editBooking.from')}
            value={fromLoc.name}
            onChangeText={(name) => setFromLoc({ type: fromLoc.type, name })}
          />
          <AuthInput
            label={t('editBooking.to')}
            value={toLoc.name}
            onChangeText={(name) => setToLoc({ type: toLoc.type, name })}
          />
        </>
      )}
      <AuthInput label={t('editBooking.date')} value={dateDisplay} onChangeText={setDateDisplay} />
      <AuthInput
        label={
          booking.is_group_master ? t('editBooking.masterPassengers') : t('editBooking.passengers')
        }
        value={passengers}
        onChangeText={setPassengers}
        keyboardType="number-pad"
        editable={!booking.is_group_master}
      />
      {booking.is_group_master ? (
        <Text style={styles.fieldHint}>{t('editBooking.masterPassengersHint')}</Text>
      ) : null}
      <AuthInput
        label={booking.is_group_master ? t('editBooking.masterPrice') : t('editBooking.price')}
        value={priceGel}
        onChangeText={setPriceGel}
        keyboardType="decimal-pad"
        editable={!booking.is_group_master}
      />
      {booking.is_group_master ? (
        <Text style={styles.fieldHint}>{t('editBooking.masterPriceHint')}</Text>
      ) : null}
      <AuthInput
        label={t('editBooking.passengerName')}
        value={passengerName}
        onChangeText={setPassengerName}
      />
      <AuthInput
        label={t('editBooking.passengerPhone')}
        value={passengerPhone}
        onChangeText={setPassengerPhone}
        keyboardType="phone-pad"
      />
      <AuthInput label={t('editBooking.signText')} value={signText} onChangeText={setSignText} />

      <View style={styles.signBox}>
        <Text style={styles.signTitle}>{t('editBooking.signFileTitle')}</Text>
        {currentSignUrl && !signFile && !removeSign ? (
          <View style={styles.currentBox}>
            <Text style={styles.currentLabel}>{t('editBooking.signFileCurrent')}</Text>
            {currentSignIsPdf ? (
              <Pressable
                onPress={() => void Linking.openURL(currentSignUrl)}
                style={({ pressed }) => [styles.currentPdf, pressed && styles.pressed]}
              >
                <Ionicons name="document-text-outline" size={30} color={COLORS.goldDark} />
                <Text style={styles.currentPdfText}>{t('editBooking.signFileOpen')}</Text>
              </Pressable>
            ) : (
              <Image source={{ uri: currentSignUrl }} style={styles.currentImage} resizeMode="contain" />
            )}
            <Pressable
              onPress={() => setRemoveSign(true)}
              disabled={saving}
              style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.error} />
              <Text style={styles.removeText}>{t('editBooking.signFileRemove')}</Text>
            </Pressable>
          </View>
        ) : null}
        {removeSign && !signFile ? (
          <View style={styles.currentBox}>
            <Text style={styles.removedText}>{t('editBooking.signFileWillRemove')}</Text>
            <Pressable
              onPress={() => setRemoveSign(false)}
              style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
            >
              <Text style={styles.undoText}>{t('editBooking.signFileUndo')}</Text>
            </Pressable>
          </View>
        ) : null}
        <PickupSignLogoField
          label={currentSignUrl ? t('editBooking.signFileNew') : t('newBooking.pickupSignLogo.label')}
          value={signFile}
          onChange={(f) => {
            setSignFile(f);
            if (f) setRemoveSign(false);
          }}
          disabled={saving}
        />
        {currentSignUrl ? <Text style={styles.signHint}>{t('editBooking.signFileReplaceHint')}</Text> : null}
      </View>
      {booking && isTransferKind(booking.kind) ? (
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

      {companyCanCancelBooking(booking) ? (
        <Pressable
          onPress={() => requestCancel(booking, { reason })}
          disabled={saving || cancellingId === booking.id}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cancelBookingBtn,
            (pressed || cancellingId === booking.id) && styles.pressed,
          ]}
        >
          {cancellingId === booking.id ? (
            <ActivityIndicator color={COLORS.error} />
          ) : (
            <Text style={styles.cancelBookingBtnText}>{t('companyCancel.title')}</Text>
          )}
        </Pressable>
      ) : booking.status === 'in_progress' && !booking.is_group_master ? (
        <Text style={styles.cancelHint}>{t('companyCancel.tripInProgress')}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: SPACING.md },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  masterBanner: {
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  masterBannerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.goldDark, marginBottom: 4 },
  masterBannerText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  fieldHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: -8, marginBottom: SPACING.md },
  signBox: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: SPACING.xs,
  },
  signTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  currentBox: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surfaceAlt,
  },
  currentLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  currentImage: { width: '100%', maxWidth: 280, height: 140 },
  currentPdf: { alignItems: 'center', gap: 4, paddingVertical: SPACING.xs },
  currentPdfText: { fontSize: 14, fontWeight: '700', color: COLORS.goldDark },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: SPACING.sm },
  removeText: { fontSize: 14, fontWeight: '600', color: COLORS.error },
  removedText: { fontSize: 13, fontWeight: '600', color: COLORS.error, textAlign: 'center', paddingHorizontal: SPACING.sm },
  undoText: { fontSize: 14, fontWeight: '700', color: COLORS.goldDark },
  signHint: { fontSize: 12, color: COLORS.textSecondary },
  saveBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.gold,
    paddingVertical: 14,
    borderRadius: RADIUS.button,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '800', fontSize: 16, color: COLORS.black },
  cancelBookingBtn: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    paddingVertical: 13,
    borderRadius: RADIUS.button,
    alignItems: 'center',
  },
  cancelBookingBtnText: { fontWeight: '700', fontSize: 15, color: COLORS.error },
  cancelHint: { marginTop: SPACING.md, fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  pressed: { opacity: 0.88 },
});
