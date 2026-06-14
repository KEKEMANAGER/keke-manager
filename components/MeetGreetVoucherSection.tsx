import { Ionicons } from '@expo/vector-icons';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import type { BookingRow } from '../lib/bookings';
import { meetGreetVoucherFieldsPresent } from '../lib/voucherPickupSign';

type Props = {
  booking: BookingRow;
  sectionTitle: string;
  passengerNameLabel: string;
  passengerPhoneLabel: string;
  pickupSignNameLabel: string;
  pickupSignLogoLabel: string;
  pickupSignPdfHint: string;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function MeetGreetVoucherSection({
  booking,
  sectionTitle,
  passengerNameLabel,
  passengerPhoneLabel,
  pickupSignNameLabel,
  pickupSignLogoLabel,
  pickupSignPdfHint,
}: Props) {
  if (!meetGreetVoucherFieldsPresent(booking)) return null;

  const logoUrl = booking.pickup_sign_logo_url?.trim();
  const logoIsPdf = logoUrl ? /\.pdf(\?|$)/i.test(logoUrl) : false;

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>{sectionTitle}</Text>
      <DetailRow label={passengerNameLabel} value={booking.passenger_name?.trim() ?? ''} />
      <DetailRow label={passengerPhoneLabel} value={booking.passenger_phone?.trim() ?? ''} />
      <DetailRow label={pickupSignNameLabel} value={booking.sign_text?.trim() ?? ''} />
      {logoUrl ? (
        <View style={styles.logoBlock}>
          <Text style={styles.logoTitle}>{pickupSignLogoLabel}</Text>
          {logoIsPdf ? (
            <Pressable onPress={() => void Linking.openURL(logoUrl)} style={styles.pdfBox}>
              <Ionicons name="document-text-outline" size={40} color={COLORS.goldDark} />
              <Text style={styles.pdfHint}>{pickupSignPdfHint}</Text>
            </Pressable>
          ) : (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.goldDark,
    marginBottom: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  detailLabel: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  detailValue: {
    flex: 1.2,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'right',
  },
  logoBlock: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
    alignItems: 'center',
  },
  logoTitle: { fontSize: 13, fontWeight: '700', alignSelf: 'stretch', textAlign: 'center' },
  logoImage: { width: '100%', height: 160, borderRadius: 8 },
  pdfBox: { alignItems: 'center', padding: SPACING.md },
  pdfHint: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
});
