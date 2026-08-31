import * as LocalAuthentication from "expo-local-authentication";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
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
import { BiometricPrompt } from "../../components/ui/BiometricPrompt";
import { Button } from "../../components/ui/Button";
import { Colors, Font, Radius, Spacing } from "../../constants/theme";
import { API_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth/context";
import { tokenStorage } from "../../lib/auth/tokenStorage";
import { useSettingsStore } from "../../store/settingsStore";

export default function LoginScreen() {
  const { login, loginWithBiometricToken } = useAuth();
  const settings = useSettingsStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBiometricOffer, setShowBiometricOffer] = useState(false);
  const [preferBiometric, setPreferBiometric] = useState(false);
  const [hardwareOk, setHardwareOk] = useState(false);

  useEffect(() => {
    (async () => {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHardwareOk(hasHw && enrolled);
      const bioToken = await tokenStorage.getBiometricToken();
      setPreferBiometric(
        Boolean(settings.biometricEnabled && bioToken && hasHw && enrolled)
      );
    })();
  }, [settings.biometricEnabled]);

  const onSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      if (
        hardwareOk &&
        !settings.biometricEnabled &&
        !settings.biometricPromptShown
      ) {
        setShowBiometricOffer(true);
      }
    } catch (e: any) {
      setError(e?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const onBiometricLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Sign in to Worldly",
        fallbackLabel: "Use password",
      });
      if (!result.success) {
        setPreferBiometric(false);
        return;
      }
      await loginWithBiometricToken();
    } catch (e: any) {
      setError(e?.message || "Face ID sign-in failed.");
      setPreferBiometric(false);
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

        {preferBiometric ? (
          <>
            <Button
              title={loading ? "Signing in…" : "Sign in with Face ID"}
              onPress={onBiometricLogin}
              disabled={loading}
            />
            <Text
              style={styles.link}
              onPress={() => setPreferBiometric(false)}
            >
              Use email instead
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}

        {error && preferBiometric ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.muted}>Don't have an account? </Text>
          <Link href="/(auth)/register" style={styles.linkInline}>
            Register
          </Link>
        </View>
      </KeyboardAvoidingView>

      <BiometricPrompt
        visible={showBiometricOffer}
        onEnable={async () => {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: "Enable Face ID for Worldly",
          });
          if (result.success) {
            const token = await tokenStorage.get();
            if (token) await tokenStorage.setBiometricToken(token);
            settings.setBiometricEnabled(true);
            settings.setBiometricPromptShown(true);
          }
          setShowBiometricOffer(false);
        }}
        onDismiss={() => {
          settings.setBiometricPromptShown(true);
          setShowBiometricOffer(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background.primary },
  wrap: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: "center",
    gap: Spacing.md,
  },
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.lg,
  },
  muted: { color: Colors.text.secondary },
  linkInline: { color: Colors.brand.teal, fontWeight: "600" },
});
