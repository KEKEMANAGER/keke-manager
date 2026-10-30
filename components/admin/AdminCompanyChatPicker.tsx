import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { fetchAdminUsers, type AdminUserRow } from '../../lib/adminPanel';
import { adminSupportChatHref } from '../../lib/supportChat';
import { UserAvatar } from '../UserAvatar';
import { adminStyles } from './adminStyles';

function companyName(u: AdminUserRow): string {
  return u.full_name?.trim() || u.email?.trim() || '—';
}

/**
 * Lets the admin start a conversation with any company, not only answer the
 * ones that wrote first. The company reads it in its "KEKE Support" chat.
 */
export function AdminCompanyChatPicker() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminUsers();
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setCompanies(
      data
        .filter((u) => u.role === 'company')
        .sort((a, b) => companyName(a).localeCompare(companyName(b))),
    );
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    // The list is read when first opened, and again on every later opening.
    if (next) void load();
  }

  const shown = useMemo(() => {
    const list = companies ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const qDigits = q.replace(/[\s-]/g, '');
    return list.filter(
      (u) =>
        companyName(u).toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (!!qDigits && (u.phone ?? '').replace(/[\s-]/g, '').includes(qDigits)),
    );
  }, [companies, query]);

  function openChat(u: AdminUserRow) {
    router.push(adminSupportChatHref({ userId: u.id, name: companyName(u), adminTab: 'chats' }));
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.toggle, open && styles.toggleOpen, pressed && styles.pressed]}
      >
        <Ionicons name={open ? 'close' : 'create-outline'} size={18} color={COLORS.goldDark} />
        <Text style={styles.toggleText}>{t('supportChat.writeToCompany')}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.hint}>{t('supportChat.writeToCompanyHint')}</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('supportChat.companySearch')}
              placeholderTextColor={COLORS.gray}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {loading ? <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.md }} /> : null}

          {error ? (
            <View style={adminStyles.errBox}>
              <Text style={adminStyles.errText}>{error}</Text>
              <Pressable onPress={() => void load()} style={adminStyles.retry}>
                <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && !error && companies && shown.length === 0 ? (
            <Text style={styles.none}>{t('supportChat.noCompanies')}</Text>
          ) : null}

          {!loading
            ? shown.map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => openChat(u)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <UserAvatar name={companyName(u)} uri={null} size={40} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {companyName(u)}
                    </Text>
                    {u.email?.trim() ? (
                      <Text style={styles.meta} numberOfLines={1}>
                        {u.email.trim()}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={COLORS.goldDark} />
                </Pressable>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.lg },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  toggleOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  toggleText: { color: COLORS.goldDark, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.88 },
  panel: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.gold,
    borderBottomLeftRadius: RADIUS.button,
    borderBottomRightRadius: RADIUS.button,
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  hint: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: COLORS.text, fontSize: 15 },
  none: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  meta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
});
