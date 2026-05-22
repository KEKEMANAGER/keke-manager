import { Redirect } from 'expo-router';
import { ExpoGoQrScreen } from '../components/ExpoGoQrScreen';

/** Dev-only: QR code to open the project in Expo Go (tunnel / LAN URL). */
export default function DevQrRoute() {
  if (!__DEV__) {
    return <Redirect href="/sign-in" />;
  }
  return <ExpoGoQrScreen showBackHint />;
}
