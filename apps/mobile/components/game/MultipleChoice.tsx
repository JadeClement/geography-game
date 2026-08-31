import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { haptics } from "../../lib/haptics";
import { CountrySilhouette } from "./CountrySilhouette";

type Option = string | { id?: string; value?: string; label?: string };

type Props = {
  options: Option[];
  resolveLabel?: (value: string) => string;
  disabled?: boolean;
  variant?: "text" | "shape";
  onSelect: (value: string) => void;
};

export function MultipleChoice({
  options,
  resolveLabel,
  disabled,
  variant = "text",
  onSelect,
}: Props) {
  const isShape = variant === "shape";
  return (
    <View style={[styles.wrap, isShape && styles.shapeWrap]}>
      {options.map((opt) => {
        const value =
          typeof opt === "string" ? opt : String(opt.id || opt.value || "");
        const label =
          typeof opt === "string"
            ? opt
            : opt.label || resolveLabel?.(value) || value;
        return (
          <Pressable
            key={value}
            disabled={disabled}
            style={[styles.option, isShape && styles.shapeOption]}
            onPress={() => {
              haptics.tap();
              onSelect(value);
            }}
          >
            {isShape ? (
              <CountrySilhouette countryId={value} height={140} fit="aspect" />
            ) : (
              <Text style={styles.label}>{label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm, marginTop: Spacing.md },
  shapeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  option: {
    backgroundColor: Colors.background.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  shapeOption: {
    width: "48%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
  },
  label: { color: Colors.text.primary, fontWeight: "600", fontSize: Font.base },
});
