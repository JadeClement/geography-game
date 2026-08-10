import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth/context";
import { api } from "../../lib/api";
import {
  computeWorldlyScoreFromMastery,
} from "@worldly/core/worldlyScore";
import { DEFAULT_LEARN_LEVEL } from "@worldly/constants";
import countriesManifest from "../../assets/data/countries.json";

export default function HomeScreen() {
  const { user } = useAuth();
  const [worldly, setWorldly] = useState<number | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mastery, weak] = await Promise.all([
          api.getAllMastery(),
          api.getWeakCountries("countries", DEFAULT_LEARN_LEVEL, "world"),
        ]);
        if (cancelled) return;
        const ids = ((countriesManifest as any).countries || [])
          .filter((c: any) => c.enabled)
          .map((c: any) => c.iso3);
        const score = computeWorldlyScoreFromMastery(mastery.mastery, ids);
        setWorldly(score.percent);
        setDueCount(weak.weakCount ?? weak.stats?.length ?? 0);
        setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goLabel = offline
    ? "Go! · offline"
    : dueCount == null
      ? "Go!"
      : `Go! · ${dueCount} due`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>Worldly</Text>
        <Pressable
          style={styles.profile}
          onPress={() => router.push("/profile")}
        >
          <Text style={styles.worldly}>
            {worldly == null ? "—" : `${worldly}%`}
          </Text>
          <Avatar name={user?.name || user?.username} size={32} />
        </Pressable>
      </View>

      {/* Static globe image fallback — see MOBILE_BUILD.md (WebView deferred) */}
      <View style={styles.globeWrap}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.globe}
          resizeMode="contain"
        />
        <Text style={styles.globeHint}>Tap Go! to practice</Text>
      </View>

      <View style={styles.actions}>
        <Button
          title={goLabel}
          onPress={() =>
            router.push({
              pathname: "/game/session",
              params: {
                mode: "countries",
                region: "world",
                gameType: "learning",
                source: "go",
              },
            })
          }
        />
        <Button
          title="Explore"
          variant="outline"
          onPress={() => router.push("/explore")}
          style={{ marginTop: Spacing.md }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { color: Colors.brand.teal, fontSize: Font.xl, fontWeight: "800" },
  profile: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  worldly: { color: Colors.text.primary, fontWeight: "700" },
  globeWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  globe: { width: 220, height: 220, opacity: 0.9 },
  globeHint: { color: Colors.text.tertiary, marginTop: Spacing.md },
  actions: { padding: Spacing.xl, paddingBottom: Spacing.section },
});
