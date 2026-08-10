import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Colors, Font } from "../../constants/theme";

export function WorldlyRing({ percent }: { percent: number }) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.border.medium}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.brand.teal}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={styles.value}>{Math.round(percent * 10) / 10}%</Text>
      <Text style={styles.label}>Worldly</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  value: {
    position: "absolute",
    color: Colors.text.primary,
    fontSize: Font.lg,
    fontWeight: "800",
    top: 42,
  },
  label: {
    position: "absolute",
    color: Colors.text.secondary,
    fontSize: Font.xs,
    top: 68,
  },
});
