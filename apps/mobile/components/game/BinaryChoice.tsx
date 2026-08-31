import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { haptics } from "../../lib/haptics";

type Choice = string | { id?: string; value?: string; label?: string };

type Props = {
  left: Choice;
  right: Choice;
  resolveLabel?: (value: string) => string;
  disabled?: boolean;
  onSelect: (value: string) => void;
};

function choiceValue(c: Choice) {
  return typeof c === "string" ? c : String(c.id || c.value || "");
}

function choiceLabel(c: Choice, resolveLabel?: (value: string) => string) {
  const value = choiceValue(c);
  if (typeof c === "string") return resolveLabel?.(value) || c;
  return c.label || resolveLabel?.(value) || value;
}

export function BinaryChoice({
  left,
  right,
  resolveLabel,
  disabled,
  onSelect,
}: Props) {
  return (
    <View style={styles.wrap}>
      {[left, right].map((choice) => {
        const value = choiceValue(choice);
        return (
          <Pressable
            key={value}
            disabled={disabled}
            style={styles.option}
            onPress={() => {
              haptics.tap();
              onSelect(value);
            }}
          >
            <Text style={styles.label}>
              {choiceLabel(choice, resolveLabel)}
            </Text>
          </Pressable>
        );
      })}
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
    textAlign: "center",
  },
});
