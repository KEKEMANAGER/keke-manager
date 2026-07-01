import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  adminUserDocUrls,
  fetchAdminUserDetail,
  formatAdminUserLanguages,
  type AdminUserDetail,
} from '../../lib/adminUserDetail';
import type { BookingRow } from '../../lib/bookings';
import type { VehicleRow } from '../../lib/vehicles';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';

type Props = {
  userId: string;
  onClose: () => void;
  onOpenUser?: (userId: string) => void;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function formatGel(n: number): string {
  return `${n.toFixed(2)} ₾`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function VehicleCard({ v }: { v: VehicleRow }) {
  const { t } = useTranslation();
  const photo = v.photo_front ?? v.photo_left ?? v.photo_right;
  return (
    <View style={styles.vehicleCard}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.vehiclePhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.vehiclePhoto, styles.vehiclePhotoPlaceholder]}>
          <Text style={styles.placeholderText}>—</Text>
        </View>
      )}
      <View style={styles.vehicleBody}>
        <Text style={styles.vehicleTitle}>
          {[v.model, v.year].filter(Boolean).join(' ') || t('adminPanel.userDetail.vehicleUntitled')}
        </Text>
        <Text style={styles.vehicleMeta}>
          {[v.color, v.plate].filter(Boolean).join(' · ') || '—'}
        </Text>
        <Text style={styles.vehicleMeta}>
          {t('adminPanel.userDetail.vehicleType')}: {v.type ?? '—'} / {v.class ?? '—'}
        </Text>
        {v.is_active ? (
          <View style={[adminStyles.badge, { marginTop: 6 }]}>
            <Text style={adminStyles.badgeText}>{t('adminPanel.userDetail.vehicleActive')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BookingLine({ b }: { b: BookingRow }) {
  const { t } = useTranslation();
  const title = b.route?.trim() || b.from_location || t('adminPanel.bookingUntitled');
  return (
    <View style={styles.bookingRow}>
      <Text style={styles.bookingTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.bookingMeta}>
        {b.status} · {formatGel(Number(b.price_gel) || 0)}
        {b.date_display ? ` · ${b.date_display}` : ''}
      </Text>
    </View>
  );
}

export function AdminUserDetailView({ userId, onClose, onOpenUser }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchAdminUserDetail(userId);
      if (err || !data) {
        setError(err?.message ?? t('adminPanel.userDetail.notFound'));
        setDetail(null);
        return;
      }
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function kindLabel(kind: AdminUserDetail['kind']): string {
    switch (kind) {
      case 'company':
        return t('adminPanel.typeCompany');
      case 'driver_hired':
        return t('adminPanel.typeHired');
      case 'driver_guide':
        return t('adminPanel.typeGuideDriver');
      case 'driver_host':
        return t('adminPanel.typeDriver');
      default:
        return t('common.admin');
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.centered}>
        <Text style={adminStyles.errText}>{error ?? t('adminPanel.userDetail.notFound')}</Text>
        <Pressable onPress={() => void load()} style={adminStyles.retry}>
          <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
        </Pressable>
        <Pressable onPress={onClose} style={[adminStyles.btnOutline, { marginTop: SPACING.md }]}>
          <Text style={adminStyles.btnOutlineText}>{t('adminPanel.userDetail.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const u = detail.user;
  const docs = adminUserDocUrls(u);
  const displayName = u.full_name?.trim() || u.email || '—';
  const companyName = u.role === 'company' ? u.full_name?.trim() : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.backBtn}>← {t('adminPanel.userDetail.back')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('adminPanel.userDetail.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
        <View style={styles.heroCard}>
          {u.avatar_url ? (
            <Image
              source={{ uri: u.avatar_url }}
              style={styles.avatar}
              onError={() => setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, avatar_url: null } } : prev))}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{displayName.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.heroText}>
            <Text style={styles.heroName}>{displayName}</Text>
            <Text style={styles.heroKind}>{kindLabel(detail.kind)}</Text>
            <View style={styles.badgeRow}>
              {u.is_verified ? (
                <Text style={styles.verifiedBadge}>✅ {t('adminPanel.userDetail.verified')}</Text>
              ) : (
                <Text style={styles.pendingBadge}>{u.verification_status ?? '—'}</Text>
              )}
              {u.is_guide_driver ? (
                <Text style={styles.guideBadge}>🎓 {t('adminPanel.typeGuideDriver')}</Text>
              ) : null}
              {detail.kind !== 'company' && detail.ratingCount > 0 ? (
                <Text style={styles.ratingBadge}>
                  ⭐ {detail.ratingAverage} ({detail.ratingCount})
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <Section title={t('adminPanel.userDetail.contact')}>
          {u.role === 'company' ? (
            <>
              {u.company_director ? <Row label={t('adminPanel.userDetail.contactPerson')} value={u.company_director} /> : null}
              {companyName ? <Row label={t('adminPanel.userDetail.companyName')} value={companyName} /> : null}
            </>
          ) : null}
          <Row label={t('adminPanel.userDetail.email')} value={u.company_email?.trim() || u.email?.trim() || '—'} />
          <Row label={t('adminPanel.userDetail.phone')} value={u.company_phone?.trim() || u.phone?.trim() || '—'} />
          {u.city ? <Row label={t('adminPanel.userDetail.city')} value={u.city} /> : null}
          {u.role === 'company' ? (
            <Row
              label={t('adminPanel.userDetail.taxId')}
              value={u.company_id_code?.trim() || u.tax_id?.trim() || '—'}
            />
          ) : null}
        </Section>

        {u.role === 'driver' ? (
          <Section title={t('adminPanel.userDetail.profile')}>
            <Row label={t('adminPanel.userDetail.languages')} value={formatAdminUserLanguages(u.languages)} />
            <Row
              label={t('adminPanel.userDetail.experience')}
              value={u.experience_years != null ? String(u.experience_years) : '—'}
            />
          </Section>
        ) : null}

        {u.role === 'company' ? (
          <Section title={t('adminPanel.userDetail.address')}>
            <Row label={t('adminPanel.userDetail.city')} value={u.city?.trim() || '—'} />
          </Section>
        ) : null}

        {docs.length > 0 ? (
          <Section title={t('adminPanel.userDetail.documents')}>
            <Row label={t('adminPanel.userDetail.verificationStatus')} value={u.verification_status ?? '—'} />
            <View style={styles.docGrid}>
              {docs.map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => setPreview({ url: d.url, title: d.key })}
                  style={({ pressed }) => [styles.docThumb, pressed && { opacity: 0.9 }]}
                >
                  <Image
                    source={{ uri: d.url }}
                    style={styles.docImage}
                    resizeMode="cover"
                    onError={() => setPreview(null)}
                  />
                  <Text style={styles.docLabel} numberOfLines={1}>
                    {d.key}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}

        {detail.fleetAsSub ? (
          <Section title={t('adminPanel.userDetail.hostSection')}>
            <Pressable
              onPress={() => onOpenUser?.(detail.fleetAsSub!.host.id)}
              disabled={!onOpenUser}
              style={({ pressed }) => pressed && onOpenUser ? { opacity: 0.85 } : undefined}
            >
              <Row
                label={t('adminPanel.userDetail.hostName')}
                value={detail.fleetAsSub.host.full_name?.trim() || detail.fleetAsSub.host.email || '—'}
              />
            </Pressable>
            <Row label={t('adminPanel.userDetail.hostEmail')} value={detail.fleetAsSub.host.email ?? '—'} />
            <Row label={t('adminPanel.userDetail.hostPhone')} value={detail.fleetAsSub.host.phone ?? '—'} />
            <Row label={t('adminPanel.userDetail.fleetStatus')} value={detail.fleetAsSub.status} />
            <Row
              label={t('adminPanel.userDetail.assignedAt')}
              value={formatDate(detail.fleetAsSub.created_at)}
            />
            {detail.fleetAsSub.vehicle ? (
              <VehicleCard v={detail.fleetAsSub.vehicle} />
            ) : null}
          </Section>
        ) : null}

        {detail.vehicles.length > 0 ? (
          <Section title={t('adminPanel.userDetail.vehicles', { count: detail.vehicles.length })}>
            {(detail.vehicles ?? []).map((v) => (
              <VehicleCard key={v.id} v={v} />
            ))}
          </Section>
        ) : null}

        {detail.fleetMembers.length > 0 ? (
          <Section title={t('adminPanel.userDetail.hiredDrivers', { count: detail.fleetMembers.length })}>
            {(detail.fleetMembers ?? []).map((m) => (
              <View key={m.id} style={styles.fleetMember}>
                <Pressable
                  onPress={() => onOpenUser?.(m.sub_driver_id)}
                  disabled={!onOpenUser}
                >
                  <Text style={styles.fleetName}>
                    {m.sub_full_name?.trim() || m.sub_email || '—'}
                  </Text>
                </Pressable>
                <Text style={styles.fleetMeta}>
                  {m.status} · {m.vehicle?.model ?? '—'} · {m.vehicle?.plate ?? '—'}
                </Text>
                <Text style={styles.fleetMeta}>{formatDate(m.created_at)}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {detail.recentRatings.length > 0 ? (
          <Section title={t('adminPanel.userDetail.recentReviews')}>
            {(detail.recentRatings ?? []).map((r) => (
              <View key={r.id} style={styles.reviewRow}>
                <Text style={styles.reviewStars}>⭐ {r.overall}</Text>
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                <Text style={styles.reviewDate}>{formatDate(r.created_at)}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        <Section title={t('adminPanel.userDetail.stats')}>
          <Row label={t('adminPanel.userDetail.statBookings')} value={String(detail.stats.total)} />
          <Row label={t('adminPanel.statCompleted')} value={String(detail.stats.completed)} />
          <Row label={t('adminPanel.userDetail.statCancelled')} value={String(detail.stats.cancelled)} />
          <Row
            label={
              u.role === 'company'
                ? t('adminPanel.userDetail.statSpend')
                : t('adminPanel.userDetail.statRevenue')
            }
            value={formatGel(detail.stats.revenueGel)}
          />
          <Row label={t('adminPanel.userDetail.registered')} value={formatDate(u.created_at)} />
          <Row label={t('adminPanel.userDetail.lastActivity')} value={formatDate(detail.lastActivityAt)} />
        </Section>

        <Section title={t('adminPanel.userDetail.recentBookings')}>
          {detail.recentBookings.length === 0 ? (
            <Text style={adminStyles.cardMeta}>{t('adminPanel.bookingsEmpty')}</Text>
          ) : (
            (detail.recentBookings ?? []).map((b) => <BookingLine key={b.id} b={b} />)
          )}
        </Section>
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{preview?.title}</Text>
            {preview?.url ? (
              <Image source={{ uri: preview.url }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
            <Pressable onPress={() => preview && void Linking.openURL(preview.url)} style={adminStyles.btnOutline}>
              <Text style={adminStyles.btnOutlineText}>{t('adminVerify.viewDocument')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: SPACING.sm,
  },
  backBtn: { color: COLORS.gold, fontWeight: '700', fontSize: 15 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.text },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: {
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 28, fontWeight: '800', color: COLORS.goldDark },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  heroKind: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  verifiedBadge: { fontSize: 12, fontWeight: '700', color: COLORS.success },
  pendingBadge: { fontSize: 12, color: COLORS.textSecondary },
  guideBadge: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  ratingBadge: { fontSize: 12, fontWeight: '700', color: COLORS.goldDark },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm },
  row: { marginBottom: 8 },
  rowLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  rowValue: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  rowLink: { fontSize: 14, color: COLORS.gold, fontWeight: '700' },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  docThumb: { width: 100 },
  docImage: { width: 100, height: 72, borderRadius: 8, backgroundColor: COLORS.surface },
  docLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4 },
  vehicleCard: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  vehiclePhoto: { width: 88, height: 66, borderRadius: 8 },
  vehiclePhotoPlaceholder: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: COLORS.gray },
  vehicleBody: { flex: 1, minWidth: 0 },
  vehicleTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  vehicleMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  fleetMember: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
  },
  fleetName: { fontSize: 15, fontWeight: '800', color: COLORS.gold },
  fleetMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  bookingRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
  },
  bookingTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  bookingMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  reviewRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
  },
  reviewStars: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  reviewComment: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  reviewDate: { fontSize: 11, color: COLORS.gray, marginTop: 4 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    maxHeight: '90%',
  },
  previewTitle: { fontSize: 14, fontWeight: '700', marginBottom: SPACING.sm, color: COLORS.text },
  previewImage: { width: '100%', height: 360, marginBottom: SPACING.md },
});
