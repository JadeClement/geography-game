import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Spacing } from "../../constants/theme";
import { API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth/context";
import { useSettingsStore } from "../../store/settingsStore";
import { scheduleStreakReminder } from "../../lib/notifications/setup";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const settings = useSettingsStore();

  return (
    <SafeAreaView style={styles.safe}>
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
            await scheduleStreakReminder(
              settings.notificationHour,
              settings.notificationMinute
            );
          }}
        />
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary, padding: Spacing.xl },
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
