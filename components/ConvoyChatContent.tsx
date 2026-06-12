import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { APP_HEADER_BODY_HEIGHT, CONTENT_PADDING_BOTTOM } from '../constants/layout';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import type { ParticipantRole } from '../lib/bookingChat';
import {
  canAccessConvoyChat,
  convoyParticipantLabel,
  fetchConvoyMessages,
  fetchConvoyParticipants,
  markConvoyMessagesRead,
  sendConvoyMessage,
  subscribeConvoyMessages,
  type ConvoyParticipant,
} from '../lib/convoyChat';
import type { MessageRow } from '../lib/messages';
import { supabase } from '../lib/supabase';
import { notifyChatUnreadMayHaveChanged } from '../lib/useChatUnreadCount';

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  masterId: string;
  onClose?: () => void;
  showClose?: boolean;
};

export function ConvoyChatContent({ masterId, onClose, showClose = true }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [participants, setParticipants] = useState<ConvoyParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const seenKeys = useRef(new Set<string>());

  const myRole: ParticipantRole = profile?.role === 'company' ? 'company' : 'driver';

  const scrollToBottom = useCallback((animated: boolean) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 60);
  }, []);

  const appendMessage = useCallback(
    (msg: MessageRow) => {
      const key = `${msg.sender_id}|${msg.text}|${msg.created_at.slice(0, 19)}`;
      if (seenKeys.current.has(key)) return;
      seenKeys.current.add(key);
      setMessages((prev) => [...prev, msg]);
      scrollToBottom(true);
    },
    [scrollToBottom],
  );

  const load = useCallback(async () => {
    if (!user?.id || !masterId) return;
    setLoading(true);
    const access = await canAccessConvoyChat(masterId, user.id);
    setAllowed(access);
    if (!access) {
      setLoading(false);
      return;
    }
    const [{ data: msgs }, { data: parts }] = await Promise.all([
      fetchConvoyMessages(masterId, user.id),
      fetchConvoyParticipants(masterId),
    ]);
    seenKeys.current = new Set(
      msgs.map((m) => `${m.sender_id}|${m.text}|${m.created_at.slice(0, 19)}`),
    );
    setMessages(msgs);
    setParticipants(parts);
    setLoading(false);
    scrollToBottom(false);
    await markConvoyMessagesRead(masterId, user.id);
    notifyChatUnreadMayHaveChanged();
  }, [masterId, scrollToBottom, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id || !masterId || !allowed) return;
    const ch = subscribeConvoyMessages(masterId, user.id, (msg) => {
      appendMessage(msg);
      void markConvoyMessagesRead(masterId, user.id).then(() => notifyChatUnreadMayHaveChanged());
    });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [allowed, appendMessage, masterId, user?.id]);

  const senderName = useCallback(
    (senderId: string) => {
      const p = participants.find((x) => x.userId === senderId);
      if (p) return convoyParticipantLabel(p, t);
      return senderId.slice(0, 8);
    },
    [participants, t],
  );

  async function onSend() {
    if (!user?.id || !text.trim() || sending || !allowed) return;
    const draft = text.trim();
    setSending(true);
    setSendError(null);
    const { error } = await sendConvoyMessage({
      senderId: user.id,
      masterId,
      text: draft,
      senderRole: myRole,
    });
    setSending(false);
    if (error) {
      setSendError(error.message);
      return;
    }
    setText('');
    await load();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.blocked}>{t('convoyChat.notAvailable')}</Text>
        {showClose && onClose ? (
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>{t('common.close')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {showClose && onClose ? (
          <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('convoyChat.title')}</Text>
          <Text style={styles.headerSub}>
            {t('convoyChat.subtitle', { count: participants.length })}
          </Text>
        </View>
      </View>

      <View style={styles.participantsWrap}>
        <Ionicons name="people-outline" size={16} color={COLORS.goldDark} />
        <Text style={styles.participantsText} numberOfLines={2}>
          {participants.map((p) => convoyParticipantLabel(p, t)).join(' · ')}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: CONTENT_PADDING_BOTTOM + insets.bottom },
        ]}
        renderItem={({ item }) => {
          const mine = item.sender_id === user?.id;
          return (
            <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapOther]}>
              {!mine ? <Text style={styles.senderLabel}>{senderName(item.sender_id)}</Text> : null}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
                <Text style={[styles.time, mine && styles.timeMine]}>{formatMsgTime(item.created_at)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('convoyChat.empty')}</Text>
        }
      />

      {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}

      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('convoyChat.placeholder')}
          multiline
        />
        <Pressable
          onPress={() => void onSend()}
          disabled={sending || !text.trim()}
          style={({ pressed }) => [styles.sendBtn, (pressed || sending) && styles.pressed]}
        >
          {sending ? (
            <ActivityIndicator color={COLORS.black} size="small" />
          ) : (
            <Ionicons name="send" size={20} color={COLORS.black} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: APP_HEADER_BODY_HEIGHT,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backBtn: { marginRight: SPACING.sm },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  blocked: { color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.md },
  closeBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
  },
  closeBtnText: { fontWeight: '700', color: COLORS.black },
  participantsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.goldTint,
  },
  participantsText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  listContent: { padding: SPACING.md, flexGrow: 1 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: SPACING.xl },
  bubbleWrap: { marginBottom: SPACING.sm, maxWidth: '88%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapOther: { alignSelf: 'flex-start' },
  senderLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4, marginLeft: 4 },
  bubble: { borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: COLORS.gold },
  bubbleOther: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  bubbleText: { fontSize: 15, color: COLORS.text },
  bubbleTextMine: { color: COLORS.black },
  time: { fontSize: 10, color: COLORS.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  timeMine: { color: COLORS.black },
  sendError: { color: COLORS.error, fontSize: 12, paddingHorizontal: SPACING.md },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: COLORS.background,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
});
