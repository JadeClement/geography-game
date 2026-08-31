import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { haptics } from "../../lib/haptics";

type Props = {
  disabled?: boolean;
  onSelect: (value: "yes" | "no") => void;
};

export function YesNo({ disabled, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      {(["yes", "no"] as const).map((value) => (
        <Pressable
          key={value}
          disabled={disabled}
          style={styles.option}
          onPress={() => {
            haptics.tap();
            onSelect(value);
          }}
        >
          <Text style={styles.label}>{value === "yes" ? "Yes" : "No"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
  option: {
    flex: 1,
    backgroundColor: Colors.background.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    alignItems: "center",
  },
  label: {
    color: Colors.text.primary,
    fontWeight: "700",
    fontSize: Font.md,
  },
});
