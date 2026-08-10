import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { api } from "../../lib/api";

type Tab = "week" | "streak" | "worldly";

export default function FriendsScreen() {
  const [tab, setTab] = useState<Tab>("week");
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getLeaderboard();
      setRows(data.leaderboard || []);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Could not load leaderboard");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await api.searchUsers(query.trim());
        setResults(data.users || []);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const sorted = [...rows].sort((a, b) => {
    if (tab === "streak") return (b.streak || 0) - (a.streak || 0);
    if (tab === "worldly") return (b.worldly || 0) - (a.worldly || 0);
    return (b.sessionsWeek || 0) - (a.sessionsWeek || 0);
  });

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Friends</Text>
      <View style={styles.tabs}>
        {(
          [
            ["week", "This Week"],
            ["streak", "Streak"],
            ["worldly", "% Worldly"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing.lg }}>
            <Text style={styles.section}>Add friends</Text>
            <TextInput
              style={styles.input}
              placeholder="Search username"
              placeholderTextColor={Colors.text.tertiary}
              autoCapitalize="none"
              value={query}
              onChangeText={setQuery}
            />
            {results.map((u) => (
              <View key={u.id} style={styles.searchRow}>
                <Text style={styles.name}>@{u.username}</Text>
                <Button
                  title="Add"
                  variant="outline"
                  style={{ paddingVertical: 6, paddingHorizontal: 12 }}
                  onPress={async () => {
                    await api.sendFriendRequest(u.id);
                    setQuery("");
                    setResults([]);
                    load();
                  }}
                />
              </View>
            ))}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Avatar name={item.name || item.username} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.isYou ? "You" : item.username}
                {item.region ? ` · ${item.region}` : ""}
              </Text>
            </View>
            <Text style={styles.pill}>{item.streak ?? 0}🔥</Text>
            <Text style={styles.pill}>{item.worldly ?? 0}%</Text>
          </View>
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
    paddingBottom: Spacing.sm,
  },
  tabs: { flexDirection: "row", paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  tab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  tabActive: { borderColor: Colors.brand.teal, backgroundColor: Colors.border.teal },
  tabText: { color: Colors.text.secondary, fontSize: Font.sm },
  tabTextActive: { color: Colors.brand.teal, fontWeight: "700" },
  error: { color: Colors.status.incorrect, padding: Spacing.lg },
  section: { color: Colors.text.secondary, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.background.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    color: Colors.text.primary,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.background.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  rank: { color: Colors.text.tertiary, width: 20, fontWeight: "700" },
  name: { color: Colors.text.primary, fontWeight: "600" },
  pill: {
    color: Colors.text.secondary,
    fontSize: Font.sm,
    fontWeight: "600",
  },
});
