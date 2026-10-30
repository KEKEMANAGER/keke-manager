import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { useTranslation } from 'react-i18next';
import { ChatScreenHeader } from '../../components/layout/ChatScreenHeader';
import { CONTENT_PADDING_BOTTOM } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import type { ChatThreadType, ParticipantRole } from '../../lib/bookingChat';
import { findActiveBookingWithPeer, sendMessage } from '../../lib/messages';
import { ChatMessageList, type ChatListItem } from '../../components/chat/ChatMessageList';
import { useChatThread } from '../../hooks/useChatThread';
import { adminPanelBackHref } from '../../lib/adminNav';
import { supabase } from '../../lib/supabase';
import { SUPPORT_THREAD_TYPE } from '../../lib/supportChat';
import { clearOpenChat, setOpenChat } from '../../lib/chatFocus';

export default function CompanyChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { user, profile } = useAuth();
  const { uid, name, avatar, bookingId, threadType, senderRole, receiverRole, adminTab } =
    useLocalSearchParams<{
      uid: string;
      name: string;
      avatar?: string;
      bookingId?: string;
      threadType?: ChatThreadType;
      senderRole?: ParticipantRole;
      receiverRole?: ParticipantRole;
      adminTab?: string;
    }>();
  // A support chat the admin opened from the panel goes back to the panel.
  const backTo = adminPanelBackHref(adminTab);

  const isSupport =
    threadType === 'support' ||
    (profile?.role === 'admin' && !bookingId?.trim());
  const threadOpts = useMemo(
    () =>
      isSupport
        ? { threadType: SUPPORT_THREAD_TYPE }
        : bookingId?.trim() && threadType
          ? { bookingId: bookingId.trim(), threadType }
          : undefined,
    [isSupport, bookingId, threadType],
  );

  const otherUserId = uid ?? '';
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const otherName = isSupport
    ? profile?.role === 'admin'
      ? name?.trim() || t('supportChat.userFallback')
      : t('supportChat.title')
    : name?.trim() || resolvedName || t('common.driver');

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [otherVerified, setOtherVerified] = useState(false);
  const [otherAvatarUrl, setOtherAvatarUrl] = useState<string | null>(avatar?.trim() || null);
  /** Fallback booking id when the screen wasn't handed one directly (push-notification tap, older
   *  conversation row) — resolved by looking up whether an active tour currently connects the two
   *  people, so sending is gated on real state rather than on how the screen was opened. */
  const [resolvedBookingId, setResolvedBookingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatListItem>>(null);

  const scrollToBottom = useCallback((animated: boolean) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 60);
  }, []);

  const { messages, loading, loadError, reload, appendSent } = useChatThread({
    userId: user?.id,
    otherUserId,
    threadOpts,
    onArrival: (kind) => scrollToBottom(kind === 'live'),
  });

  // While this conversation is on screen, its messages are not announced on
  // top of it — no banner, sound or dialog on the phone, no popup in the
  // browser. Focus and blur rather than mount: this screen is a hidden tab and
  // stays mounted after you leave it, which used to keep the person "open".
  const openThreadType = threadOpts?.threadType ?? null;
  const openBookingId = threadOpts && 'bookingId' in threadOpts ? threadOpts.bookingId : null;
  useFocusEffect(
    useCallback(() => {
      if (!otherUserId) return;
      setOpenChat(otherUserId, { threadType: openThreadType, bookingId: openBookingId });
      return () => clearOpenChat(otherUserId);
    }, [otherUserId, openThreadType, openBookingId]),
  );

  useEffect(() => {
    // Clear the previous person BEFORE fetching the new one. This screen is
    // reused when you open one conversation after another, so without the
    // reset a person who has no photo simply kept showing whoever was on
    // screen before them — the fetch below only ever wrote an avatar it
    // found, never cleared one it did not.
    setOtherAvatarUrl(avatar?.trim() || null);
    setResolvedName(null);
    setOtherVerified(false);

    if (!otherUserId) return;

    // Switching quickly can leave an earlier request in flight; without this
    // guard its late answer would overwrite the person now on screen.
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await supabase
          .from('users_directory')
          .select('full_name, is_verified, avatar_url')
          .eq('id', otherUserId)
          .maybeSingle();
        if (cancelled) return;
        const row = data as {
          full_name?: string | null;
          is_verified?: boolean | null;
          avatar_url?: string | null;
        } | null;
        setOtherVerified(!!row?.is_verified);
        const url = row?.avatar_url?.trim() ?? '';
        setOtherAvatarUrl(url || avatar?.trim() || null);
        const fullName = row?.full_name?.trim() ?? '';
        setResolvedName(fullName || null);
      } catch {
        if (!cancelled) setOtherVerified(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [otherUserId, avatar]);

  useEffect(() => {
    if (isSupport || (threadOpts && 'bookingId' in threadOpts)) {
      setResolvedBookingId(null);
      return;
    }
    if (!user?.id || !otherUserId) return;
    let cancelled = false;
    void findActiveBookingWithPeer(user.id, otherUserId).then((id) => {
      if (!cancelled) setResolvedBookingId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [isSupport, threadOpts, user?.id, otherUserId]);

  async function onSend() {
    if (!user?.id || !text.trim() || sending) return;
    const effectiveBookingId =
      threadOpts && 'bookingId' in threadOpts ? threadOpts.bookingId : resolvedBookingId;
    if (!isSupport && profile?.role !== 'admin' && !effectiveBookingId) {
      setSendError(t('chat.activeBookingRequired'));
      return;
    }
    const draft = text.trim();
    setText('');
    setSendError(null);
    setSending(true);
    const { data: sent, error } = await sendMessage({
      senderId: user.id,
      receiverId: otherUserId,
      text: draft,
      bookingId: isSupport ? null : effectiveBookingId,
      threadType: isSupport ? SUPPORT_THREAD_TYPE : (threadOpts?.threadType ?? 'company_driver'),
      senderRole: senderRole ?? null,
      receiverRole: receiverRole ?? null,
      senderName: profile?.full_name?.trim() || '',
    });
    setSending(false);
    if (error || !sent) {
      setSendError(t('chat.sendError'));
      return;
    }
    appendSent(sent);
    scrollToBottom(true);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Android 15 draws edge to edge, so the window no longer resizes for
      // the keyboard and `undefined` left this bar underneath it — the
      // driver could not see what he was typing. Lift it in JS on both.
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ChatScreenHeader
        otherName={otherName}
        otherAvatarUrl={otherAvatarUrl}
        otherVerified={otherVerified}
        backTo={backTo}
      />

      {loadError && !loading ? (
        <View style={styles.loadErrorWrap}>
          <Text style={styles.loadErrorText}>{t('chat.loadError')}</Text>
          <Pressable onPress={() => void reload()} style={styles.loadErrorRetry}>
            <Text style={styles.loadErrorRetryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        <ChatMessageList
          listRef={listRef}
          messages={messages}
          myId={user?.id}
          emptyText={
            isSupport
              ? profile?.role === 'admin'
                ? t('supportChat.adminEmptyMessages')
                : t('supportChat.emptyMessages')
              : t('chat.emptyMessages')
          }
          paddingBottom={CONTENT_PADDING_BOTTOM}
        />
      )}

      {sendError ? <Text style={styles.sendErr}>{sendError}</Text> : null}

      <View
        style={[
          styles.inputBar,
          {
            // The keyboard covers the home indicator / navigation bar
            // itself, so that inset is only wanted while it is down.
            paddingBottom: keyboardVisible
              ? SPACING.md
              : Math.max(insets.bottom, SPACING.md) + SPACING.sm,
          },
        ]}
      >
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={1000}
          // On a computer Enter sends and Shift+Enter starts a new line. (A
          // multi-line box on the web never fires onSubmitEditing, so Enter
          // used to do nothing at all.)
          onKeyPress={
            Platform.OS === 'web'
              ? (e) => {
                  const k = e.nativeEvent as unknown as {
                    key?: string;
                    shiftKey?: boolean;
                    isComposing?: boolean;
                  };
                  if (k.key === 'Enter' && !k.shiftKey && !k.isComposing) {
                    (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                    void onSend();
                  }
                }
              : undefined
          }
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
  loadErrorWrap: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  loadErrorText: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
  },
  loadErrorRetry: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  loadErrorRetryText: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 14,
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
    backgroundColor: '#F1F2F5',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    paddingHorizontal: SPACING.lg,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 120,
    minHeight: 44,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as object) : null),
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
