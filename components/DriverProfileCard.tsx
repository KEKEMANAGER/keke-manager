import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
import { UserAvatar } from './UserAvatar';

type Props = {
  fullName: string | null | undefined;
  /** `profiles.avatar_url` (media bucket), with users fallback applied upstream */
  avatarUrl: string | null | undefined;
  /** First `vehicles` photo (media bucket) */
  vehiclePhotoUrl: string | null | undefined;
  /** Vehicle model / chips block below the banner */
  vehicleInfo?: ReactNode;
  /** Name, rating, verified badge — rendered beside the avatar */
  driverDetails: ReactNode;
  /** Experience, languages, bio, etc. */
  footer?: ReactNode;
};

export function DriverProfileCard({
  fullName,
  avatarUrl,
  vehiclePhotoUrl,
  vehicleInfo,
  driverDetails,
  footer,
}: Props) {
  const vehicleUri = (vehiclePhotoUrl ?? '').trim();

  return (
    <View style={styles.root}>
      {vehicleUri.startsWith('http') ? (
        <Image source={{ uri: vehicleUri }} style={styles.vehiclePhoto} resizeMode="cover" />
      ) : (
        <View style={styles.vehiclePhotoPlaceholder}>
          <Text style={styles.vehiclePlaceholderIcon}>🚗</Text>
        </View>
      )}

      {vehicleInfo ? <View style={styles.vehicleInfo}>{vehicleInfo}</View> : null}

      <View style={styles.divider} />

      <View style={styles.driverRow}>
        <UserAvatar name={fullName} uri={avatarUrl} size={48} />
        <View style={styles.driverDetails}>{driverDetails}</View>
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  vehiclePhoto: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surfaceAlt,
  },
  vehiclePhotoPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  vehiclePlaceholderIcon: {
    fontSize: 48,
  },
  vehicleInfo: {
    marginBottom: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  driverDetails: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    marginTop: SPACING.xs,
  },
});
