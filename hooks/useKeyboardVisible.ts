import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * True while the software keyboard is on screen.
 *
 * A chat bar carries safe-area padding so it clears the home indicator or the
 * Android navigation bar. The keyboard covers that strip itself, so keeping
 * the padding while it is up pushes the bar a stripe too high. Knowing which
 * state we are in is what lets the bar sit exactly on top of the keyboard.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
