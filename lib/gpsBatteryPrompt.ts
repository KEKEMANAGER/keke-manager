import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The one-time question on Android: "let KEKE run without battery limits".
 * Asked on the GPS screen during a trip (app/(driver)/gps.tsx); asked again
 * after the server had to tell the driver his GPS stopped.
 */
export const BATTERY_PROMPT_KEY = 'gps:battery-prompt:v1';

export async function batteryPromptAsked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BATTERY_PROMPT_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markBatteryPromptAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(BATTERY_PROMPT_KEY, '1');
  } catch {
    // asked again next time at worst
  }
}

export async function resetBatteryPrompt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BATTERY_PROMPT_KEY);
  } catch {
    // nothing to do
  }
}
