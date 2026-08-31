import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SettingsState = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  preferredVoice: "joanna" | "matthew";
  biometricEnabled: boolean;
  biometricPromptShown: boolean;
  setSoundEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setNotificationTime: (hour: number, minute: number) => void;
  setPreferredVoice: (v: "joanna" | "matthew") => void;
  setBiometricEnabled: (v: boolean) => void;
  setBiometricPromptShown: (v: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      hapticsEnabled: true,
      notificationsEnabled: true,
      notificationHour: 20,
      notificationMinute: 0,
      preferredVoice: "joanna",
      biometricEnabled: false,
      biometricPromptShown: false,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setNotificationsEnabled: (notificationsEnabled) =>
        set({ notificationsEnabled }),
      setNotificationTime: (notificationHour, notificationMinute) =>
        set({ notificationHour, notificationMinute }),
      setPreferredVoice: (preferredVoice) => set({ preferredVoice }),
      setBiometricEnabled: (biometricEnabled) => set({ biometricEnabled }),
      setBiometricPromptShown: (biometricPromptShown) =>
        set({ biometricPromptShown }),
    }),
    {
      name: "worldly-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
