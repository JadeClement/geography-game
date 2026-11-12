import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "outline" && styles.outline,
        variant === "danger" && styles.danger,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === "outline" && { color: Colors.brand.teal },
          variant === "danger" && { color: Colors.status.incorrect },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
  },
  primary: { backgroundColor: Colors.brand.teal },
  secondary: { backgroundColor: Colors.background.card },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border.teal,
  },
  danger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.status.incorrect,
  },
  disabled: { opacity: 0.5 },
  text: {
    color: Colors.background.primary,
    fontSize: Font.md,
    fontWeight: "700",
  },
});
