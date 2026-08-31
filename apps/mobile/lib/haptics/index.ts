import * as Haptics from "expo-haptics";
import { useSettingsStore } from "../../store/settingsStore";

function enabled() {
  return useSettingsStore.getState().hapticsEnabled;
}

export const haptics = {
  /** Correct answer confirmed — NotificationFeedbackType.Success */
  correct() {
    if (!enabled()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  },
  /** Wrong answer confirmed — NotificationFeedbackType.Error */
  incorrect() {
    if (!enabled()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {}
    );
  },
  /** Light impact for taps (map, MC, yes/no, binary, swipe-dismiss) */
  tap() {
    if (!enabled()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Friend request sent / streak milestone — Success */
  success() {
    if (!enabled()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  },
};
