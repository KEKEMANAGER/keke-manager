import { Ionicons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import type { MessageRow } from '../../lib/messages';

/** Messages closer together than this, from the same person, read as one group. */
const GROUP_GAP_MS = 5 * 60 * 1000;

type Item =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; msg: MessageRow; mine: boolean; first: boolean; last: boolean };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Day headers, and which bubbles belong together. */
export function buildChatItems(
  messages: MessageRow[],
  myId: string | null | undefined,
  labels: { today: string; yesterday: string; months: string[] },
  now: Date = new Date(),
): Item[] {
  const out: Item[] = [];
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);
  let lastDay = '';
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]!;
    const d = new Date(m.created_at);
    const dk = dayKey(d);
    if (dk !== lastDay) {
      lastDay = dk;
      const label =
        dk === today
          ? labels.today
          : dk === yesterday
            ? labels.yesterday
            : `${d.getDate()} ${labels.months[d.getMonth()] ?? ''}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
      out.push({ kind: 'day', key: `day-${dk}`, label });
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameAsPrev =
      !!prev &&
      prev.sender_id === m.sender_id &&
      dayKey(new Date(prev.created_at)) === dk &&
      d.getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
    const sameAsNext =
      !!next &&
      next.sender_id === m.sender_id &&
      dayKey(new Date(next.created_at)) === dk &&
      new Date(next.created_at).getTime() - d.getTime() < GROUP_GAP_MS;
    out.push({
      kind: 'msg',
      key: m.id,
      msg: m,
      mine: m.sender_id === myId,
      first: !sameAsPrev,
      last: !sameAsNext,
    });
  }
  return out;
}

type Props = {
  listRef: RefObject<FlatList<Item> | null>;
  messages: MessageRow[];
  myId: string | null | undefined;
  emptyText: string;
  paddingBottom: number;
};

/**
 * The conversation itself: day headers, bubbles grouped by person, the time
 * in each bubble and, on your own messages, whether they have been read.
 */
export function ChatMessageList({ listRef, messages, myId, emptyText, paddingBottom }: Props) {
  const { t } = useTranslation();
  const items = useMemo(
    () =>
      buildChatItems(messages, myId, {
        today: t('chat.today'),
        yesterday: t('chat.yesterday'),
        months: t('calendarScreen.months').split(','),
      }),
    [messages, myId, t],
  );

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.key}
      style={styles.list}
      contentContainerStyle={[
        styles.content,
        items.length === 0 && styles.contentEmpty,
        { paddingBottom },
      ]}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={34} color={COLORS.goldDark} />
          </View>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      }
      renderItem={({ item }) => {
        if (item.kind === 'day') {
          return (
            <View style={styles.dayWrap}>
              <Text style={styles.dayText}>{item.label}</Text>
            </View>
          );
        }
        const { msg, mine, first, last } = item;
        return (
          <View
            style={[
              styles.row,
              mine ? styles.rowMine : styles.rowTheirs,
              { marginTop: first ? 10 : 3 },
            ]}
          >
            <View
              style={[
                styles.bubble,
                mine ? styles.bubbleMine : styles.bubbleTheirs,
                last && (mine ? styles.tailMine : styles.tailTheirs),
              ]}
            >
              <Text style={styles.text}>{msg.text}</Text>
              <View style={styles.meta}>
                <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>
                  {formatTime(msg.created_at)}
                </Text>
                {mine ? (
                  <Ionicons
                    name={msg.is_read ? 'checkmark-done' : 'checkmark'}
                    size={15}
                    color={msg.is_read ? COLORS.blue : COLORS.textMuted}
                    accessibilityLabel={msg.is_read ? 'read' : 'sent'}
                  />
                ) : null}
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

export type ChatListItem = Item;

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F4F5F8' },
  content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  contentEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: '#F7DFA8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  dayWrap: { alignItems: 'center', marginTop: SPACING.md, marginBottom: 2 },
  dayText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 6,
  },
  bubbleMine: { backgroundColor: '#FDECC8', borderWidth: 1, borderColor: '#F6DB9E' },
  bubbleTheirs: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EBEF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tailMine: { borderBottomRightRadius: 6 },
  tailTheirs: { borderBottomLeftRadius: 6 },
  text: { fontSize: 15.5, lineHeight: 21, color: COLORS.text },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  time: { fontSize: 11 },
  timeMine: { color: '#A87B16' },
  timeTheirs: { color: COLORS.textMuted },
});
