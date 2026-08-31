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

export async function getPermissionStatus(): Promise<{
  granted: boolean;
  canAsk: boolean;
}> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return { granted: true, canAsk: false };
  if (existing.status === "denied") return { granted: false, canAsk: false };
  const asked = await AsyncStorage.getItem(PERMISSION_KEY);
  return { granted: false, canAsk: asked !== "1" };
}

/**
 * Register Expo push token with the API once per install (app_meta gate).
 * Call after first Go! session completion when permission is granted.
 */
export async function getAndRegisterPushToken(): Promise<void> {
  const registered = await getMeta("push_token_registered");
  if (registered === "1") return;

  const existingToken = await getMeta("expo_push_token");
  if (existingToken) {
    await setMeta("push_token_registered", "1");
    return;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.registerPushToken(token, platform);
  await setMeta("expo_push_token", token);
  await setMeta("push_token_registered", "1");
}

export async function scheduleStreakReminder(
  hour: number,
  minute: number
): Promise<void> {
  if (!useSettingsStore.getState().notificationsEnabled) {
    await cancelStreakReminder();
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const already = scheduled.some(
    (n) => n.content?.data?.type === "streak_reminder"
  );
  if (already) {
    // Reschedule to pick up time changes
    await cancelStreakReminder();
  }

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

export async function cancelStreakReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content?.data?.type === "streak_reminder")
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

/** Ensure a streak reminder exists when notifications are enabled. */
export async function ensureStreakReminderScheduled(): Promise<void> {
  const { notificationsEnabled, notificationHour, notificationMinute } =
    useSettingsStore.getState();
  if (!notificationsEnabled) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const hasReminder = scheduled.some(
    (n) => n.content?.data?.type === "streak_reminder"
  );
  if (hasReminder) return;

  await scheduleStreakReminder(notificationHour, notificationMinute);
}
