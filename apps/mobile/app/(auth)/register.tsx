import { Link, router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth/context";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await register(name.trim(), username.trim(), email.trim(), password);
      setDone(true);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Could not create account.");
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
        <Text style={styles.sub}>Create your account</Text>
        {done ? (
          <Text style={styles.ok}>
            Check your email to verify your account.
          </Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor={Colors.text.tertiary}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={Colors.text.tertiary}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.text.tertiary}
          autoCapitalize="none"
          keyboardType="email-address"
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
          title={loading ? "Creating…" : "Register"}
          onPress={onSubmit}
          disabled={loading}
        />
        <View style={styles.footer}>
          <Text style={styles.muted}>Already have an account? </Text>
          <Link href="/(auth)/login" style={styles.linkInline}>
            Sign in
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
  },
  sub: { color: Colors.text.secondary, marginBottom: Spacing.md },
  input: {
    backgroundColor: Colors.background.card,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text.primary,
  },
  error: { color: Colors.status.incorrect },
  ok: { color: Colors.brand.teal },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: Spacing.lg },
  muted: { color: Colors.text.secondary },
  linkInline: { color: Colors.brand.teal, fontWeight: "600" },
});
