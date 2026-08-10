import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { REGIONS } from "@worldly/constants";
import { Card } from "../../components/ui/Card";
import { Colors, Font, Spacing } from "../../constants/theme";
import countriesManifest from "../../assets/data/countries.json";

function regionCount(id: string) {
  const countries = (countriesManifest as any).countries || [];
  if (id === "world") return countries.filter((c: any) => c.enabled).length;
  return countries.filter((c: any) => c.enabled && c.region === id).length;
}

export default function ExploreIndex() {
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Choose a region</Text>
      <FlatList
        data={REGIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/explore/${item.id}`)}>
            <Card>
              <Text style={styles.name}>{item.label}</Text>
              <Text style={styles.meta}>{regionCount(item.id)} countries</Text>
            </Card>
          </Pressable>
        )}
      />
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
  name: { color: Colors.text.primary, fontSize: Font.md, fontWeight: "700" },
  meta: { color: Colors.text.secondary, marginTop: 4 },
});
