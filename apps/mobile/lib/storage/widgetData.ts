import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "worldly_widget_data";

export type WidgetData = {
  streak: number;
  dueCount: number;
  worldlyPercent: number;
  updatedAt: number;
};

/**
 * Persist widget snapshot for a future home-screen widget extension.
 *
 * Full App Group + native widget UI is deferred (requires a development build
 * with expo-widgets / react-native-widget-extension — not available in Expo Go).
 * This writes a JSON snapshot the native target can later read from App Group
 * `group.app.beworldly.app`.
 */
export async function writeWidgetData(data: WidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        streak: data.streak ?? 0,
        dueCount: data.dueCount ?? 0,
        worldlyPercent: data.worldlyPercent ?? 0,
        updatedAt: data.updatedAt ?? Date.now(),
      })
    );
  } catch {
    // widget write must never break gameplay
  }
}

export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetData;
  } catch {
    return null;
  }
}
