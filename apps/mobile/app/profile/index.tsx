import * as LocalAuthentication from "expo-local-authentication";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Spacing } from "../../constants/theme";
import { API_URL, api } from "../../lib/api";
import { useAuth } from "../../lib/auth/context";
import { tokenStorage } from "../../lib/auth/tokenStorage";
import {
  cancelStreakReminder,
  scheduleStreakReminder,
} from "../../lib/notifications/setup";
import { useSettingsStore } from "../../store/settingsStore";

export default function ProfileScreen() {
  const { user, logout, deleteAccount } = useAuth();
  const settings = useSettingsStore();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHw && enrolled);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.label}>Account</Text>
      <Text style={styles.value}>@{user?.username}</Text>
      <Text style={styles.value}>{user?.email}</Text>
      <Button
        title="Change password"
        variant="outline"
        style={{ marginTop: Spacing.md }}
        onPress={() => Linking.openURL(`${API_URL}/forgot-password`)}
      />

      <Text style={[styles.label, { marginTop: Spacing.xl }]}>Preferences</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Sound</Text>
        <Switch
          value={settings.soundEnabled}
          onValueChange={settings.setSoundEnabled}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Haptics</Text>
        <Switch
          value={settings.hapticsEnabled}
          onValueChange={settings.setHapticsEnabled}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Daily reminder</Text>
        <Switch
          value={settings.notificationsEnabled}
          onValueChange={async (v) => {
            settings.setNotificationsEnabled(v);
            if (v) {
              await scheduleStreakReminder(
                settings.notificationHour,
                settings.notificationMinute
              );
            } else {
              await cancelStreakReminder();
            }
          }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Voice (Matthew)</Text>
        <Switch
          value={settings.preferredVoice === "matthew"}
          onValueChange={(v) =>
            settings.setPreferredVoice(v ? "matthew" : "joanna")
          }
        />
      </View>
      {biometricAvailable ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Face ID login</Text>
          <Switch
            value={settings.biometricEnabled}
            onValueChange={async (v) => {
              if (v) {
                const result = await LocalAuthentication.authenticateAsync({
                  promptMessage: "Enable Face ID for Worldly",
                });
                if (!result.success) return;
                const token = await tokenStorage.get();
                if (token) await tokenStorage.setBiometricToken(token);
                settings.setBiometricEnabled(true);
                settings.setBiometricPromptShown(true);
              } else {
                settings.setBiometricEnabled(false);
                await tokenStorage.clearBiometricToken();
                try {
                  await api.logout();
                } catch {
                  // local clear is enough
                }
              }
            }}
          />
        </View>
      ) : null}

      <Text style={[styles.label, { marginTop: Spacing.xl }]}>About</Text>
      <Text style={styles.value}>
        Version {Constants.expoConfig?.version || "1.0.0"}
      </Text>
      <Button
        title="Privacy policy"
        variant="outline"
        style={{ marginTop: Spacing.md }}
        onPress={() => Linking.openURL("https://beworldly.app/privacy")}
      />

      <Button
        title="Sign out"
        variant="secondary"
        style={{ marginTop: Spacing.section }}
        onPress={async () => {
          await logout();
          router.replace("/(auth)/login");
        }}
      />

      <Text style={[styles.label, { marginTop: Spacing.xl }]}>Delete account</Text>
      <Text style={styles.value}>
        Permanently deletes your account, mastery, friends, and visited countries.
        This cannot be undone.
      </Text>
      <Button
        title={deleting ? "Deleting…" : "Delete account"}
        variant="danger"
        disabled={deleting}
        style={{ marginTop: Spacing.md }}
        onPress={() => {
          Alert.alert(
            "Delete your account?",
            "This permanently deletes your account and all of its data. You will be signed out. This cannot be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete account",
                style: "destructive",
                onPress: () => {
                  if (deletingRef.current) return;
                  deletingRef.current = true;
                  setDeleting(true);
                  deleteAccount()
                    .then(() => {
                      router.replace("/(auth)/login");
                    })
                    .catch((error: unknown) => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Could not delete your account.";
                      Alert.alert("Couldn't delete account", message);
                    })
                    .finally(() => {
                      deletingRef.current = false;
                      setDeleting(false);
                    });
                },
              },
            ]
          );
        }}
      />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing.section,
  },
  title: { color: Colors.text.primary, fontSize: Font.xl, fontWeight: "800" },
  label: {
    color: Colors.text.secondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    fontWeight: "700",
  },
  value: { color: Colors.text.primary },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  rowLabel: { color: Colors.text.primary },
});
