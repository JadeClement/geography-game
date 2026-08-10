import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Colors, Font, Spacing } from "../constants/theme";

export default function NotFound() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Not found</Text>
      <Link href="/(tabs)" style={styles.link}>
        Go home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  title: { color: Colors.text.primary, fontSize: Font.xl, fontWeight: "800" },
  link: { color: Colors.brand.teal },
});
