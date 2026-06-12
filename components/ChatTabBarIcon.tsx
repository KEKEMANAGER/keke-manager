import { TabBarIcon } from './TabBarIcon';
import { useChatUnread } from '../contexts/ChatUnreadContext';

type Props = {
  color: string;
  focused: boolean;
};

/** Tab icon with live unread badge — must read from ChatUnreadContext (tab options do not re-render on web). */
export function ChatTabBarIcon({ color, focused }: Props) {
  const { tabBadge } = useChatUnread();
  return (
    <TabBarIcon
      name="chatbubbles-outline"
      color={color}
      focused={focused}
      badge={tabBadge}
    />
  );
}
