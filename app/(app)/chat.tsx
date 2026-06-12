import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
import { ChatScreenHeader } from '../../components/layout/ChatScreenHeader';
import { CONTENT_PADDING_BOTTOM } from '../../constants/layout';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import type { ChatThreadType, ParticipantRole } from '../../lib/bookingChat';
import {
  fetchMessages,
  markMessagesRead,
  sendMessage,
  subscribeToMessages,
  type MessageRow,
} from '../../lib/messages';
import { supabase } from '../../lib/supabase';
import { notifyChatUnreadMayHaveChanged } from '../../lib/useChatUnreadCount';
import { setActiveChatPeerId } from '../../lib/webChatAlerts';

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CompanyChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { uid, name, avatar, bookingId, threadType, senderRole, receiverRole } =
    useLocalSearchParams<{
      uid: string;
      name: string;
      avatar?: string;
      bookingId?: string;
      threadType?: ChatThreadType;
      senderRole?: ParticipantRole;
      receiverRole?: ParticipantRole;
    }>();

  const isSupport = threadType === 'support';
  const threadOpts = isSupport
    ? { threadType: 'support' as const }
    : bookingId?.trim() && threadType
      ? { bookingId: bookingId.trim(), threadType }
      : undefined;

  const otherUserId = uid ?? '';
  const otherName = isSupport
    ? profile?.role === 'admin'
      ? name?.trim() || t('supportChat.userFallback')
      : t('supportChat.title')
    : name?.trim() || t('common.driver');

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [otherVerified, setOtherVerified] = useState(false);
  const [otherAvatarUrl, setOtherAvatarUrl] = useState<string | null>(avatar?.trim() || null);
  const listRef = useRef<FlatList<MessageRow>>(null);

  const scrollToBottom = useCallback((animated: boolean) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 60);
  }, []);

  const load = useCallback(async () => {
    if (!user?.id || !otherUserId) return;
    const { data } = await fetchMessages(user.id, otherUserId, threadOpts);
    setMessages(data);
    setLoading(false);
    scrollToBottom(false);
    await markMessagesRead(user.id, otherUserId, threadOpts);
    notifyChatUnreadMayHaveChanged();
  }, [user?.id, otherUserId, scrollToBottom, threadOpts?.bookingId, threadOpts?.threadType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !otherUserId) return;
    setActiveChatPeerId(otherUserId);
    return () => setActiveChatPeerId(null);
  }, [otherUserId]);

  useEffect(() => {
    if (!otherUserId) {
      setOtherVerified(false);
      setOtherAvatarUrl(null);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('users_directory')
        .select('is_verified, avatar_url')
        .eq('id', otherUserId)
        .maybeSingle();
      const row = data as { is_verified?: boolean | null; avatar_url?: string | null } | null;
      setOtherVerified(!!row?.is_verified);
      const url = row?.avatar_url?.trim() ?? '';
      if (url) setOtherAvatarUrl(url);
    })();
  }, [otherUserId]);

  useEffect(() => {
    if (!user?.id || !otherUserId) return;
    const ch = subscribeToMessages(
      user.id,
      otherUserId,
      (msg) => {
        setMessages((prev) => [...prev, msg]);
        scrollToBottom(true);
        void markMessagesRead(user.id!, otherUserId, threadOpts).then(() =>
          notifyChatUnreadMayHaveChanged(),
        );
      },
      threadOpts,
    );
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, otherUserId, scrollToBottom, threadOpts?.bookingId, threadOpts?.threadType]);

  async function onSend() {
    if (!user?.id || !text.trim() || sending) return;
    const draft = text.trim();
    setText('');
    setSendError(null);
    setSending(true);
    const { data: sent, error } = await sendMessage({
      senderId: user.id,
      receiverId: otherUserId,
      text: draft,
      bookingId: threadOpts && 'bookingId' in threadOpts ? threadOpts.bookingId : null,
      threadType: threadOpts?.threadType ?? null,
      senderRole: senderRole ?? null,
      receiverRole: receiverRole ?? null,
      senderName: profile?.full_name?.trim() || '',
    });
    setSending(false);
    if (error || !sent) {
      setSendError(t('chat.sendError'));
      return;
    }
    setMessages((prev) => [...prev, sent]);
    scrollToBottom(true);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ChatScreenHeader
        otherName={otherName}
        otherAvatarUrl={otherAvatarUrl}
        otherVerified={otherVerified}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.msgList,
            messages.length === 0 && styles.msgListEmpty,
            { paddingBottom: CONTENT_PADDING_BOTTOM },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>
                {isSupport ? t('supportChat.emptyMessages') : t('chat.emptyMessages')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.sender_id === user?.id;
            return (
              <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
                    {item.text}
                  </Text>
                  <Text style={[styles.timeText, isMine ? styles.timeTextMine : styles.timeTextTheirs]}>
                    {formatMsgTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {sendError ? <Text style={styles.sendErr}>{sendError}</Text> : null}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.sm }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={1000}
          onSubmitEditing={Platform.OS !== 'web' ? undefined : () => void onSend()}
        />
        <Pressable
          onPress={() => void onSend()}
          disabled={!text.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            (!text.trim() || sending) && styles.sendBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
        >
          {sending ? (
            <ActivityIndicator color="#0f0f0f" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#0f0f0f" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgList: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  msgListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 6,
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: '#FEF3C7',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 21,
  },
  msgTextMine: {
    color: COLORS.text,
  },
  msgTextTheirs: {
    color: COLORS.text,
  },
  timeText: {
    fontSize: 11,
  },
  timeTextMine: {
    color: COLORS.goldDark,
    textAlign: 'right',
  },
  timeTextTheirs: {
    color: COLORS.textMuted,
    textAlign: 'left',
  },
  sendErr: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
});
