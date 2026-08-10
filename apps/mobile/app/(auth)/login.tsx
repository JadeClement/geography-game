import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth/context";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
      >
        <Text style={styles.brand}>Worldly</Text>
        <Text style={styles.sub}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.text.tertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.text.tertiary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title={loading ? "Signing in…" : "Sign in"}
          onPress={onSubmit}
          disabled={loading}
        />
        <Text
          style={styles.link}
          onPress={() => Linking.openURL(`${API_URL}/forgot-password`)}
        >
          Forgot password?
        </Text>
        <View style={styles.footer}>
          <Text style={styles.muted}>Don't have an account? </Text>
          <Link href="/(auth)/register" style={styles.linkInline}>
            Register
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary },
  wrap: { flex: 1, padding: Spacing.xl, justifyContent: "center", gap: Spacing.md },
  brand: {
    color: Colors.brand.teal,
    fontSize: Font.xxl,
    fontWeight: "800",
    marginBottom: Spacing.sm,
  },
  sub: { color: Colors.text.secondary, marginBottom: Spacing.lg },
  input: {
    backgroundColor: Colors.background.card,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text.primary,
    fontSize: Font.base,
  },
  error: { color: Colors.status.incorrect, fontSize: Font.sm },
  link: {
    color: Colors.text.secondary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: Spacing.lg },
  muted: { color: Colors.text.secondary },
  linkInline: { color: Colors.brand.teal, fontWeight: "600" },
});
