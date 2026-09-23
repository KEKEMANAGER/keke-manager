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

type DailyMessageRow = {
  id: string;
  message: string;
  is_active: boolean;
  created_at: string;
};

export function AdminMotivationSection() {
  const [messages, setMessages] = useState<DailyMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('daily_messages')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) {
        setError(err.message);
        setMessages([]);
        return;
      }
      setMessages(Array.isArray(data) ? (data as DailyMessageRow[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handlePublish() {
    if (!text.trim()) { setError('ტექსტი სავალდებულოა'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('daily_messages').insert({
      message: text.trim(),
      is_active: true,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setText('');
    void load();
  }

  async function toggleActive(row: DailyMessageRow) {
    await supabase.from('daily_messages').update({ is_active: !row.is_active }).eq('id', row.id);
    void load();
  }

  async function handleDelete(id: string) {
    await supabase.from('daily_messages').delete().eq('id', id);
    void load();
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>☀️ დღის მოტივაცია</Text>
      <Text style={styles.hint}>
        ტექსტი გამოჩნდება ერთხელ დღეში popup-ის სახით კომპანიებთან და მძღოლებთან. აქტიური
        მხოლოდ ერთი ბოლო შეტყობინება მოქმედებს.
      </Text>

      <View style={styles.form}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="მაგ: დღეს კარგი დღეა წარმატებისთვის 💪"
          placeholderTextColor={COLORS.textMuted}
          multiline
        />
        <Pressable
          onPress={handlePublish}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.8 }]}
        >
          {saving
            ? <ActivityIndicator color={COLORS.white} size="small" />
            : <Text style={styles.saveBtnText}>გამოქვეყნება</Text>
          }
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.lg }} />
      ) : messages.length === 0 ? (
        <Text style={styles.empty}>შეტყობინებები არ არის</Text>
      ) : (
        <ScrollView>
          {messages.map((row) => (
            <View key={row.id} style={[styles.card, !row.is_active && styles.cardInactive]}>
              <View style={styles.cardTop}>
                <Text style={styles.cardText}>{row.message}</Text>
                <View style={styles.cardStatus}>
                  <View style={[styles.statusDot, row.is_active ? styles.statusOn : styles.statusOff]} />
                  <Text style={[styles.statusText, row.is_active ? styles.statusTextOn : styles.statusTextOff]}>
                    {row.is_active ? 'აქტიური' : 'გათიშული'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                {new Date(row.created_at).toLocaleString('ka-GE')}
              </Text>
              <View style={styles.cardBtns}>
                <Pressable
                  onPress={() => void toggleActive(row)}
                  style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.toggleBtnText}>
                    {row.is_active ? '⏸ გათიშვა' : '▶ გააქტიურება'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleDelete(row.id)}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
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
    minHeight: 80,
    textAlignVertical: 'top',
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  cardInactive: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm },
  cardText: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  cardMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  cardStatus: { alignItems: 'flex-end', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusOn: { backgroundColor: '#22c55e' },
  statusOff: { backgroundColor: COLORS.border },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextOn: { color: '#22c55e' },
  statusTextOff: { color: COLORS.textMuted },
  cardBtns: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', marginTop: SPACING.sm },
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
