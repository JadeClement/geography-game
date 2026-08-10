import { StyleSheet, View, ViewProps } from "react-native";
import { Colors, Radius, Spacing } from "../../constants/theme";

export function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    padding: Spacing.lg,
  },
});
