import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";

type Props = {
  countryName: string;
  factText: string;
  flagUrl?: string | null;
  onDismiss: () => void;
};

export function FactModal({ countryName, factText, onDismiss }: Props) {
  const translateY = useSharedValue(400);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 280 });
    const t = setTimeout(() => onDismiss(), 4000);
    return () => clearTimeout(t);
  }, [onDismiss, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const pan = Gesture.Pan().onUpdate((e) => {
    if (e.translationY > 0) translateY.value = e.translationY;
  }).onEnd((e) => {
    if (e.translationY > 60) {
      translateY.value = withTiming(400, { duration: 200 }, () => {
        runOnJS(onDismiss)();
      });
    } else {
      translateY.value = withTiming(0);
    }
  });

  return (
    <Pressable style={styles.backdrop} onPress={onDismiss}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, style]}>
          <View style={styles.handle} />
          <Text style={styles.name}>{countryName}</Text>
          <Text style={styles.fact}>{factText}</Text>
        </Animated.View>
      </GestureDetector>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    height: "65%",
    backgroundColor: Colors.background.secondary,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.medium,
    marginBottom: Spacing.lg,
  },
  name: {
    color: Colors.text.primary,
    fontSize: Font.xl,
    fontWeight: "800",
    marginBottom: Spacing.md,
  },
  fact: { color: Colors.text.secondary, fontSize: Font.md, lineHeight: 24 },
});
