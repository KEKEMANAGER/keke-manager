import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  fetchMessages,
  markMessagesRead,
  mergeMessages,
  subscribeToMessages,
  type MessageRow,
  type MessageThreadOptions,
} from '../lib/messages';
import { supabase } from '../lib/supabase';
import { notifyChatUnreadMayHaveChanged } from '../lib/useChatUnreadCount';

/** While a conversation is on screen it is also re-read this often. */
const POLL_MS = 7000;

export type ChatArrival = 'initial' | 'live';

/**
 * One conversation, kept current while it is on screen.
 *
 * New messages arrive live, and the conversation does not depend on that alone:
 * a phone that slept or a browser tab that was in the background can lose the
 * live connection without saying so — the admin then saw nothing new until he
 * left the chat and came back. So the live channel is opened again whenever
 * the screen or the app comes back, and the thread is re-read every few
 * seconds while it is visible. Everything is merged by message id, so nothing
 * shows twice.
 */
export function useChatThread({
  userId,
  otherUserId,
  threadOpts,
  onArrival,
}: {
  userId: string | null | undefined;
  otherUserId: string;
  threadOpts: MessageThreadOptions | undefined;
  /** Messages appeared: 'initial' after the first read, 'live' for new ones from the other person. */
  onArrival?: (kind: ChatArrival) => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const messagesRef = useRef<MessageRow[]>([]);
  const onArrivalRef = useRef(onArrival);
  onArrivalRef.current = onArrival;
  const appActiveRef = useRef(true);

  const threadKey = !threadOpts
    ? 'direct'
    : 'bookingId' in threadOpts
      ? `${threadOpts.threadType}:${threadOpts.bookingId}`
      : threadOpts.threadType;
  const key = `${userId ?? ''}|${otherUserId}|${threadKey}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  const commit = useCallback((next: MessageRow[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const markRead = useCallback(() => {
    if (!userId || !otherUserId) return;
    void markMessagesRead(userId, otherUserId, threadOpts)
      .then(() => notifyChatUnreadMayHaveChanged())
      .catch(() => undefined);
  }, [userId, otherUserId, threadOpts]);

  const pull = useCallback(
    async (mode: 'initial' | 'merge') => {
      if (!userId || !otherUserId) {
        setLoading(false);
        return;
      }
      const askedFor = key;
      let res: { data: MessageRow[]; error: Error | null };
      try {
        res = await fetchMessages(userId, otherUserId, threadOpts);
      } catch {
        res = { data: [], error: new Error('fetch failed') };
      }
      // Another conversation was opened meanwhile; this answer is not for it.
      if (keyRef.current !== askedFor) return;
      if (res.error) {
        if (mode === 'initial') {
          setLoadError(true);
          commit([]);
          setLoading(false);
        }
        return;
      }
      setLoadError(false);
      const rows = Array.isArray(res.data) ? res.data : [];
      if (mode === 'initial') {
        commit(mergeMessages([], rows));
        setLoading(false);
        onArrivalRef.current?.('initial');
        markRead();
        return;
      }
      const before = messagesRef.current;
      const known = new Set(before.map((m) => m.id));
      const next = mergeMessages(before, rows);
      if (next !== before) commit(next);
      if (rows.some((m) => !known.has(m.id) && m.sender_id === otherUserId)) {
        onArrivalRef.current?.('live');
        markRead();
      }
    },
    [userId, otherUserId, threadOpts, key, commit, markRead],
  );

  // A different conversation starts clean and is read once.
  useEffect(() => {
    commit([]);
    setLoadError(false);
    setLoading(true);
    void pull('initial');
  }, [key, pull, commit]);

  // Live: a fresh channel for this conversation, and again on every `epoch`.
  useEffect(() => {
    if (!userId || !otherUserId) return;
    const ch = subscribeToMessages(
      userId,
      otherUserId,
      (msg) => {
        const before = messagesRef.current;
        const next = mergeMessages(before, [msg]);
        if (next === before) return;
        commit(next);
        onArrivalRef.current?.('live');
        markRead();
      },
      threadOpts,
    );
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, otherUserId, threadOpts, epoch, commit, markRead]);

  // Coming back to the screen: catch up and reconnect. While it is on screen,
  // re-read every few seconds.
  const focusedKeyRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!userId || !otherUserId) return undefined;
      if (focusedKeyRef.current === key) {
        setEpoch((n) => n + 1);
        void pull('merge');
      }
      focusedKeyRef.current = key;
      const id = setInterval(() => {
        if (appActiveRef.current) void pull('merge');
      }, POLL_MS);
      return () => clearInterval(id);
    }, [userId, otherUserId, key, pull]),
  );

  // Coming back to the app (phone) or to the tab (browser): the same.
  useEffect(() => {
    const onActive = () => {
      appActiveRef.current = true;
      setEpoch((n) => n + 1);
      void pull('merge');
    };
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return undefined;
      const onVisibility = () => {
        if (document.visibilityState === 'visible') onActive();
        else appActiveRef.current = false;
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onActive();
      else appActiveRef.current = false;
    });
    return () => sub.remove();
  }, [pull]);

  /** A message this user just sent. */
  const appendSent = useCallback(
    (msg: MessageRow) => {
      commit(mergeMessages(messagesRef.current, [msg]));
    },
    [commit],
  );

  const reload = useCallback(() => {
    setLoading(true);
    return pull('initial');
  }, [pull]);

  return { messages, loading, loadError, reload, appendSent };
}
