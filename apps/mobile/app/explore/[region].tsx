import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/ui/Card";
import { Colors, Font, Spacing } from "../../constants/theme";

const CATEGORIES = [
  { id: "countries", label: "Countries" },
  { id: "capitals", label: "Capitals" },
  { id: "flags", label: "Flags" },
];

export default function ExploreCategory() {
  const { region } = useLocalSearchParams<{ region: string }>();

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Choose a category</Text>
      <View style={styles.list}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push(`/explore/${region}/${c.id}`)}
          >
            <Card>
              <Text style={styles.name}>{c.label}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary },
  title: {
    color: Colors.text.primary,
    fontSize: Font.xl,
    fontWeight: "800",
    padding: Spacing.xl,
  },
  list: { padding: Spacing.lg, gap: Spacing.md },
  name: { color: Colors.text.primary, fontSize: Font.md, fontWeight: "700" },
});
