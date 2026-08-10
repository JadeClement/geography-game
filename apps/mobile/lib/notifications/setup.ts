import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "../api";
import { getMeta, setMeta } from "../storage/db";
import { useSettingsStore } from "../../store/settingsStore";

const PERMISSION_KEY = "worldly_notif_permission_asked";

export async function requestPermissionIfAppropriate(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (existing.status === "denied") return false;

  const asked = await AsyncStorage.getItem(PERMISSION_KEY);
  if (asked === "1") return false;

  const result = await Notifications.requestPermissionsAsync();
  await AsyncStorage.setItem(PERMISSION_KEY, "1");
  return result.granted;
}

export async function getAndRegisterPushToken(): Promise<void> {
  const existing = await getMeta("expo_push_token");
  if (existing) return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.registerPushToken(token, platform);
  await setMeta("expo_push_token", token);
}

export async function scheduleStreakReminder(
  hour: number,
  minute: number
): Promise<void> {
  if (!useSettingsStore.getState().notificationsEnabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time for your daily review 🌍",
      body: "Keep your streak going!",
      data: { type: "streak_reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}
