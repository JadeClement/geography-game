import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { Button } from "./Button";

type Props = {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
};

export function BiometricPrompt({ visible, onEnable, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Sign in faster</Text>
          <Text style={styles.body}>
            Use Face ID to open Worldly without typing your password.
          </Text>
          <Button title="Enable Face ID" onPress={onEnable} />
          <Pressable onPress={onDismiss} style={styles.dismiss}>
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
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
  },
  title: {
    color: Colors.text.primary,
    fontSize: Font.lg,
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
  dismiss: { paddingVertical: Spacing.sm, alignItems: "center" },
  dismissText: { color: Colors.text.tertiary, fontWeight: "600" },
});
