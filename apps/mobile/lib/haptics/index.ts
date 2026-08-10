import * as Haptics from "expo-haptics";
import { useSettingsStore } from "../../store/settingsStore";

export const haptics = {
  correct() {
    if (!useSettingsStore.getState().hapticsEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  },
  incorrect() {
    if (!useSettingsStore.getState().hapticsEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {}
    );
  },
  tap() {
    if (!useSettingsStore.getState().hapticsEnabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
};
