import { Image, StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius } from "../../constants/theme";

type Props = {
  name?: string | null;
  color?: string | null;
  flagUrl?: string | null;
  size?: number;
};

export function Avatar({ name, color, flagUrl, size = 36 }: Props) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (flagUrl) {
    return (
      <Image
        source={{ uri: flagUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color || Colors.brand.tealDeep,
        },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  initial: { color: Colors.text.primary, fontWeight: "700" },
});
