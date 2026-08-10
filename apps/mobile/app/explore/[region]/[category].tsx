import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LEVEL_SECTIONS } from "@worldly/constants";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Colors, Font, Spacing } from "../../../constants/theme";

export default function ExploreModeLevel() {
  const { region, category } = useLocalSearchParams<{
    region: string;
    category: string;
  }>();

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>How do you want to play?</Text>
      <View style={styles.list}>
        <Button
          title="Learn (mixed questions)"
          onPress={() =>
            router.push({
              pathname: "/game/session",
              params: {
                mode: category,
                region,
                gameType: "learning",
                source: "explore",
              },
            })
          }
        />
        <Text style={styles.section}>Test</Text>
        {LEVEL_SECTIONS.map((section) => (
          <View key={section.id} style={{ gap: Spacing.sm }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.levels.map((level) => (
              <Pressable
                key={level.level}
                onPress={() =>
                  router.push({
                    pathname: "/game/session",
                    params: {
                      mode: category,
                      region,
                      gameType: "test",
                      level: level.level,
                      source: "explore",
                    },
                  })
                }
              >
                <Card>
                  <Text style={styles.name}>{level.title}</Text>
                  <Text style={styles.meta}>{level.description}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
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
  section: {
    color: Colors.text.secondary,
    marginTop: Spacing.lg,
    fontWeight: "700",
  },
  sectionTitle: { color: Colors.brand.teal, fontWeight: "700" },
  name: { color: Colors.text.primary, fontWeight: "700" },
  meta: { color: Colors.text.secondary, marginTop: 4 },
});
