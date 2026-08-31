import { Modal, StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { Button } from "./Button";

type Props = {
  visible: boolean;
  days: number;
  onDismiss: () => void;
};

export function StreakMilestoneOverlay({ visible, days, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🔥</Text>
          <Text style={styles.title}>{days}-day streak!</Text>
          <Text style={styles.body}>
            You've practiced Worldly for {days} days in a row. Impressive.
          </Text>
          <Button title="Keep going" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.background.overlay,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: "center",
  },
  emoji: { fontSize: 48 },
  title: {
    color: Colors.brand.amber,
    fontSize: Font.xl,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: Colors.text.secondary,
    fontSize: Font.base,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
});
