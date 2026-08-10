import { StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";

export function MasteryBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{Math.round(pct)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  label: { color: Colors.text.secondary, fontSize: Font.sm },
  value: { color: Colors.text.primary, fontWeight: "700", fontSize: Font.sm },
  track: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.border.subtle,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: Colors.brand.teal },
});
