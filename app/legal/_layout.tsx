import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants/theme';

function useLegalGoBack() {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);
}

function LegalBackButton() {
  const { t } = useTranslation();
  const goBack = useLegalGoBack();

  return (
    <Pressable
      onPress={goBack}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      style={{ paddingHorizontal: 4 }}
    >
      <Ionicons name="chevron-back" size={24} color={COLORS.text} />
    </Pressable>
  );
}

export default function LegalLayout() {
  const { t } = useTranslation();
  const goBack = useLegalGoBack();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: COLORS.background },
        headerBackVisible: false,
        headerLeft: () => <LegalBackButton />,
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
