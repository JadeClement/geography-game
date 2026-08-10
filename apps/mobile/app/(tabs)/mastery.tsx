import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Colors, Font, Spacing } from "../../constants/theme";
import { api } from "../../lib/api";
import { computeWorldlyScoreFromMastery } from "@worldly/core/worldlyScore";
import countriesManifest from "../../assets/data/countries.json";
import { MasteryMapSVG } from "../../components/mastery/MasteryMapSVG";
import { WorldlyRing } from "../../components/mastery/WorldlyRing";
import { MasteryBar } from "../../components/mastery/MasteryBar";

type Cat = "countries" | "capitals" | "flags" | "all";

export default function MasteryScreen() {
  const shotRef = useRef<ViewShot>(null);
  const [mastery, setMastery] = useState<any>(null);
  const [cat, setCat] = useState<Cat>("all");

  const countryIds = useMemo(
    () =>
      ((countriesManifest as any).countries || [])
        .filter((c: any) => c.enabled)
        .map((c: any) => c.iso3),
    []
  );

  useEffect(() => {
    api.getAllMastery().then((d) => setMastery(d.mastery)).catch(() => {});
  }, []);

  const score = mastery
    ? computeWorldlyScoreFromMastery(mastery, countryIds)
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ViewShot ref={shotRef} style={{ flex: 1 }} options={{ format: "png" }}>
        <View style={styles.wrap}>
          <View style={styles.header}>
            <Text style={styles.title}>Mastery</Text>
            <Pressable
              onPress={async () => {
                const uri = await shotRef.current?.capture?.();
                if (uri && (await Sharing.isAvailableAsync())) {
                  await Sharing.shareAsync(uri);
                }
              }}
            >
              <Text style={styles.share}>Share</Text>
            </Pressable>
          </View>
          <WorldlyRing percent={score?.percent ?? 0} />
          <View style={styles.bars}>
            <MasteryBar
              label="Countries"
              value={(score?.categories?.countries ?? 0) * 100}
            />
            <MasteryBar
              label="Capitals"
              value={(score?.categories?.capitals ?? 0) * 100}
            />
            <MasteryBar
              label="Flags"
              value={(score?.categories?.flags ?? 0) * 100}
            />
          </View>
          <View style={styles.tabs}>
            {(["all", "countries", "capitals", "flags"] as Cat[]).map((id) => (
              <Pressable key={id} onPress={() => setCat(id)} style={styles.tab}>
                <Text
                  style={{
                    color: cat === id ? Colors.brand.teal : Colors.text.secondary,
                    textTransform: "capitalize",
                  }}
                >
                  {id}
                </Text>
              </Pressable>
            ))}
          </View>
          <MasteryMapSVG mastery={mastery} category={cat} />
        </View>
      </ViewShot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary },
  wrap: { flex: 1, padding: Spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: Colors.text.primary, fontSize: Font.xl, fontWeight: "800" },
  share: { color: Colors.brand.teal, fontWeight: "700" },
  bars: { gap: Spacing.sm, marginVertical: Spacing.lg },
  tabs: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.md },
  tab: { paddingVertical: 4 },
});
