import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

type Variant = 'driver' | 'company';

function usePulseOpacity() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

function SkeletonBar({
  opacity,
  width,
  height,
  style,
}: {
  opacity: Animated.Value;
  width: number | `${number}%`;
  height: number;
  style?: object;
}) {
  return (
    <Animated.View
      style={[
        styles.bar,
        { width, height, opacity },
        style,
      ]}
    />
  );
}

function DriverSkeletonCard({ opacity }: { opacity: Animated.Value }) {
  return (
    <View style={styles.card}>
      <SkeletonBar opacity={opacity} width="55%" height={18} />
      <SkeletonBar opacity={opacity} width="40%" height={14} style={{ marginTop: 10 }} />
      <SkeletonBar opacity={opacity} width="100%" height={16} style={{ marginTop: 12 }} />
      <View style={styles.footerRow}>
        <SkeletonBar opacity={opacity} width={72} height={22} />
        <View style={styles.actionsRow}>
          <SkeletonBar opacity={opacity} width={88} height={36} />
          <SkeletonBar opacity={opacity} width={96} height={36} />
        </View>
      </View>
    </View>
  );
}

function CompanySkeletonCard({ opacity }: { opacity: Animated.Value }) {
  return (
    <View style={styles.companyCard}>
      <View style={styles.companyTop}>
        <SkeletonBar opacity={opacity} width="35%" height={14} />
        <SkeletonBar opacity={opacity} width={64} height={22} />
      </View>
      <SkeletonBar opacity={opacity} width="90%" height={18} style={{ marginTop: 8 }} />
      <SkeletonBar opacity={opacity} width="50%" height={14} style={{ marginTop: 8 }} />
      <View style={styles.companyDriver}>
        <SkeletonBar opacity={opacity} width={48} height={12} />
        <SkeletonBar opacity={opacity} width="70%" height={16} style={{ marginTop: 8 }} />
      </View>
      <SkeletonBar opacity={opacity} width={88} height={20} style={{ alignSelf: 'flex-end', marginTop: 8 }} />
    </View>
  );
}

/** Three pulsing placeholder cards while bookings load (no extra deps). */
export function BookingListSkeleton({ variant }: { variant: Variant }) {
  const opacity = usePulseOpacity();
  const Card = variant === 'driver' ? DriverSkeletonCard : CompanySkeletonCard;
  return (
    <View style={styles.wrap}>
      <Card opacity={opacity} />
      <Card opacity={opacity} />
      <Card opacity={opacity} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  bar: {
    borderRadius: 8,
    backgroundColor: COLORS.border,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  companyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  companyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyDriver: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
