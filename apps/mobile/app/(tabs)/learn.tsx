import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Spacing } from "../../constants/theme";

export default function LearnTab() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Learn</Text>
        <Text style={styles.body}>
          Mixed-question practice weighted toward countries you are still
          building mastery on.
        </Text>
        <Button
          title="Start Learn session"
          onPress={() =>
            router.push({
              pathname: "/game/session",
              params: {
                mode: "countries",
                region: "world",
                gameType: "learning",
                source: "learn",
              },
            })
          }
        />
        <Button
          title="Choose region"
          variant="outline"
          style={{ marginTop: Spacing.md }}
          onPress={() => router.push("/explore")}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary },
  wrap: { flex: 1, padding: Spacing.xl, justifyContent: "center", gap: Spacing.md },
  title: { color: Colors.text.primary, fontSize: Font.xl, fontWeight: "800" },
  body: { color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 },
});
