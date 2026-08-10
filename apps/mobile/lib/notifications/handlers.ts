import * as Notifications from "expo-notifications";
import { router } from "expo-router";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function setupNotificationHandlers(): void {
  Notifications.addNotificationReceivedListener(() => {
    // Foreground: system banner via handler above
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const type = response.notification.request.content.data?.type;
    if (type === "streak_reminder") {
      router.push("/(tabs)/");
    } else if (type === "friend_overtake") {
      router.push("/(tabs)/friends");
    } else if (type === "streak_milestone") {
      router.push("/(tabs)/mastery");
    }
  });
}
