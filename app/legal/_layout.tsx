import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/theme';

export default function LegalLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen
        name="[slug]"
        options={{
          title: t('legal.document'),
        }}
      />
    </Stack>
  );
}
