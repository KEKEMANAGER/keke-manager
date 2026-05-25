import { Redirect } from 'expo-router';

/**
 * Web: full map opens in a Modal from Admin Panel (AdminGpsSection).
 * Direct navigation here used to crash; redirect back to GPS tab.
 */
export default function AdminTrackingWebRedirect() {
  return <Redirect href="/(app)/admin-panel?tab=gps" />;
}
