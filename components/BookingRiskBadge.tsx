import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  bookingRiskReasonKey,
  topBookingRiskReason,
  type BookingRiskAssessment,
  type BookingRiskLevel,
} from '../lib/bookingRisk';
import { RADIUS, SPACING } from '../constants/theme';

type Props = {
  assessment: BookingRiskAssessment | null | undefined;
};

/**
 * One line on the booking card: "this one needs a phone call, and here is why".
 *
 * The reason is the whole point. „მაღალი რისკი" on its own is an accusation
 * nobody can act on; "the 1h reminder went out and he has not answered" tells
 * the company exactly what to do next. Extra reasons are kept behind a tap so
 * the common case stays one quiet line.
 *
 * Shown to companies and to admin only. The driver never sees this — being
 * told by an app that you look unreliable is how you lose a driver, and he can
 * already see the one thing that would clear it: the confirm button.
 */
export function BookingRiskBadge({ assessment }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const top = useMemo(() => topBookingRiskReason(assessment), [assessment]);
  if (!assessment || assessment.level === 'none' || !top) return null;

  const level: BookingRiskLevel = assessment.level;
  const rest = assessment.reasons.slice(1);
  const palette = LEVELS[level];

  return (
    <Pressable
      onPress={rest.length > 0 ? () => setExpanded((v) => !v) : undefined}
      style={[styles.box, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <View style={styles.headRow}>
        <Text style={[styles.head, { color: palette.text }]}>
          {palette.icon} {t(`bookingRisk.level.${level}`)}
        </Text>
        {rest.length > 0 ? (
          <Text style={[styles.more, { color: palette.text }]}>
            {expanded ? '▴' : `+${rest.length}`}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.reason, { color: palette.text }]}>
        {t(bookingRiskReasonKey(top.code), top.params ?? {})}
      </Text>

      {expanded
        ? rest.map((reason, index) => (
            <Text
              key={`${reason.code}-${index}`}
              style={[styles.reason, styles.reasonExtra, { color: palette.text }]}
            >
              • {t(bookingRiskReasonKey(reason.code), reason.params ?? {})}
            </Text>
          ))
        : null}
    </Pressable>
  );
}

const LEVELS: Record<
  Exclude<BookingRiskLevel, 'none'>,
  { bg: string; border: string; text: string; icon: string }
> = {
  low: { bg: '#F1F5F9', border: '#CBD5E1', text: '#334155', icon: 'ℹ️' },
  medium: { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E', icon: '⚠️' },
  high: { bg: '#FEE2E2', border: '#FECACA', text: '#991B1B', icon: '🚨' },
};

const styles = StyleSheet.create({
  box: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    gap: 2,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  head: {
    fontSize: 13,
    fontWeight: '800',
  },
  more: {
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.8,
  },
  reason: {
    fontSize: 12,
    lineHeight: 17,
  },
  reasonExtra: {
    opacity: 0.9,
  },
});
