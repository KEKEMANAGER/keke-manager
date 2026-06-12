import { createContext, useContext, type ReactNode } from 'react';
import { useChatUnreadCount } from '../lib/useChatUnreadCount';

type ChatUnreadValue = ReturnType<typeof useChatUnreadCount>;

const ChatUnreadContext = createContext<ChatUnreadValue | null>(null);

export function ChatUnreadProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const value = useChatUnreadCount(userId);
  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread(): ChatUnreadValue {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    throw new Error('useChatUnread must be used within ChatUnreadProvider');
  }
  return ctx;
}
