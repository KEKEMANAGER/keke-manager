import { Stack } from 'expo-router';
import { AuthScope } from '../../components/AuthScope';
import { COLORS } from '../../constants/theme';

export default function AuthLayout() {
  return (
    <AuthScope>
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: COLORS.background },
      }}
    />
    </AuthScope>
  );
}
