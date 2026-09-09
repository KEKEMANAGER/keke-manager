import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';
import i18n from '../src/lib/i18n';

export type MediaPermissionKind = 'library' | 'camera';

/**
 * - 'granted': go ahead and open the picker/camera.
 * - 'denied': not granted yet, but the OS can still ask again — show the
 *   screen's own "we need this permission" message as before.
 * - 'denied_permanently': the OS will never show its prompt again. This
 *   helper has already shown an alert offering to open Settings, so
 *   callers should NOT show an additional message for this case.
 */
export type MediaPermissionOutcome = 'granted' | 'denied' | 'denied_permanently';

/**
 * Ensures we hold the given media permission before opening the
 * picker/camera.
 *
 * On iOS, once a user taps "Don't Allow", the system permission dialog
 * will never reappear (`canAskAgain` becomes `false`) — calling
 * `requestXAsync()` again just silently resolves to `granted: false`
 * with no way for the user to recover from inside a plain "access
 * denied" message. This helper checks the current status first, only
 * triggers the system prompt when a decision hasn't been made yet, and
 * — when access was permanently denied — shows an alert with a button
 * that opens the device Settings screen so the user can turn it on
 * themselves.
 *
 * @param title Alert title to use for the Settings-recovery alert (pass
 *   the screen's existing permission-title translation).
 */
export async function ensureMediaPermission(
  kind: MediaPermissionKind,
  title: string,
): Promise<MediaPermissionOutcome> {
  const getStatus =
    kind === 'camera' ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
  const requestStatus =
    kind === 'camera'
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

  let perm = await getStatus();
  if (!perm.granted && perm.canAskAgain) {
    perm = await requestStatus();
  }
  if (perm.granted) return 'granted';

  // Web has no OS-level Settings screen to send the user to, and no
  // permanently-denied concept — just report the plain denial.
  if (Platform.OS === 'web' || perm.canAskAgain) {
    return 'denied';
  }

  // Permanently denied on a native device: only Settings can fix this.
  Alert.alert(title, i18n.t('common.permissionDeniedSettingsBody'), [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    { text: i18n.t('common.openSettings'), onPress: () => void Linking.openSettings() },
  ]);
  return 'denied_permanently';
}
