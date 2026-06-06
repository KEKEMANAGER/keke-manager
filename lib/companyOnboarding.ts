import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@keke/company_onboarding_v1:';

export async function getCompanyOnboardingDone(userId: string): Promise<boolean> {
  const id = userId.trim();
  if (!id) return true;
  const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${id}`);
  return raw === '1';
}

export async function setCompanyOnboardingDone(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id) return;
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${id}`, '1');
}
