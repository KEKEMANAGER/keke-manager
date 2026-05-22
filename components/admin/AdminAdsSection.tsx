import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

type Ad = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

const EMPTY_FORM = {
  title: '',
  subtitle: '',
  image_url: '',
  link_url: '',
  ends_at: '',
};

export function AdminAdsSection() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('ads')
      .select('*')
      .order('created_at', { ascending: false });
    setAds((data as Ad[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleSave() {
    if (!form.title.trim()) { setError('სათაური სავალდებულოა'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('ads').insert({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url.trim() || null,
      link_url: form.link_url.trim() || null,
      ends_at: form.ends_at.trim() || null,
      is_active: true,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm(EMPTY_FORM);
    setShowForm(false);
    void load();
  }

  async function toggleActive(ad: Ad) {
    await supabase.from('ads').update({ is_active: !ad.is_active }).eq('id', ad.id);
    void load();
  }

  async function handleDelete(id: string) {
    await supabase.from('ads').delete().eq('id', id);
    void load();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>📢 რეკლამები</Text>
        <Pressable
          onPress={() => setShowForm((v) => !v)}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={COLORS.white} />
          <Text style={styles.addBtnText}>{showForm ? 'გაუქმება' : 'ახალი'}</Text>
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>ახალი რეკლამა</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>სათაური *</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
            placeholder="მაგ: Marriott Hotel"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>ქვესათაური</Text>
          <TextInput
            style={styles.input}
            value={form.subtitle}
            onChangeText={(v) => setForm((p) => ({ ...p, subtitle: v }))}
            placeholder="მაგ: 20% ფასდაკლება"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>სურათის URL</Text>
          <TextInput
            style={styles.input}
            value={form.image_url}
            onChangeText={(v) => setForm((p) => ({ ...p, image_url: v }))}
            placeholder="https://..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>ლინკი</Text>
          <TextInput
            style={styles.input}
            value={form.link_url}
            onChangeText={(v) => setForm((p) => ({ ...p, link_url: v }))}
            placeholder="https://..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>ვადა (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={form.ends_at}
            onChangeText={(v) => setForm((p) => ({ ...p, ends_at: v }))}
            placeholder="2025-12-31"
            placeholderTextColor={COLORS.textMuted}
          />

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.8 }]}
          >
            {saving
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <Text style={styles.saveBtnText}>შენახვა</Text>
            }
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.lg }} />
      ) : ads.length === 0 ? (
        <Text style={styles.empty}>რეკლამები არ არის</Text>
      ) : (
        <ScrollView>
          {ads.map((ad) => (
            <View key={ad.id} style={[styles.adCard, !ad.is_active && styles.adCardInactive]}>
              <View style={styles.adCardTop}>
                <View style={styles.adCardInfo}>
                  <Text style={styles.adTitle}>{ad.title}</Text>
                  {ad.subtitle ? <Text style={styles.adSubtitle}>{ad.subtitle}</Text> : null}
                  {ad.ends_at ? (
                    <Text style={styles.adMeta}>
                      ვადა: {new Date(ad.ends_at).toLocaleDateString('ka-GE')}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.adCardStatus}>
                  <View style={[styles.statusDot, ad.is_active ? styles.statusOn : styles.statusOff]} />
                  <Text style={[styles.statusText, ad.is_active ? styles.statusTextOn : styles.statusTextOff]}>
                    {ad.is_active ? 'აქტიური' : 'გათიშული'}
                  </Text>
                </View>
              </View>
              <View style={styles.adCardBtns}>
                <Pressable
                  onPress={() => void toggleActive(ad)}
                  style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.toggleBtnText}>
                    {ad.is_active ? '⏸ გათიშვა' : '▶ გააქტიურება'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleDelete(ad.id)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.button,
  },
  addBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  saveBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  saveBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  errorText: { color: COLORS.error, fontSize: 13, marginBottom: SPACING.sm },
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xl, fontSize: 15 },
  adCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  adCardInactive: { opacity: 0.6 },
  adCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  adCardInfo: { flex: 1 },
  adTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  adSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  adMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  adCardStatus: { alignItems: 'flex-end', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusOn: { backgroundColor: '#22c55e' },
  statusOff: { backgroundColor: COLORS.border },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextOn: { color: '#22c55e' },
  statusTextOff: { color: COLORS.textMuted },
  adCardBtns: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleBtnText: { color: COLORS.gold, fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.button,
  },
});
