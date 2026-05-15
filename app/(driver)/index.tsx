import { Redirect } from 'expo-router';

/** Tabs group has no default child on web; redirect bare /(driver) to the first tab. */
export default function DriverIndex() {
  return <Redirect href="/(driver)/dashboard" />;
}
