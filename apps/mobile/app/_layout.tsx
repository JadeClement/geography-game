import "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Colors } from "../constants/theme";
import { AuthProvider, useAuth } from "../lib/auth/context";
import { setupNotificationHandlers } from "../lib/notifications/handlers";
import {
  cacheCountriesFromJSON,
  getMeta,
  getPendingAnswers,
  initialize,
  markAnswerSynced,
} from "../lib/storage/db";
import { api } from "../lib/api";
import countriesManifest from "../assets/data/countries.json";

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setupNotificationHandlers();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!isAuthenticated && !inAuth) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuth) {
      router.replace("/(tabs)");
    }
  }, [isLoading, isAuthenticated, segments, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      await initialize();
      const cachedAt = await getMeta("countries_cached_at");
      const week = 7 * 24 * 60 * 60 * 1000;
      if (!cachedAt || Date.now() - Number(cachedAt) > week) {
        await cacheCountriesFromJSON(
          (countriesManifest as any).countries || []
        );
      }
      try {
        const pending = await getPendingAnswers();
        for (const row of pending) {
          await api.recordCountryStat({
            countryId: row.country_id,
            mode: row.mode,
            level: row.level,
            outcome: row.outcome,
            responseTimeMs: row.response_time_ms,
            gameType: row.game_type,
            learnModeMultiplier: row.learn_mode_multiplier,
          });
          await markAnswerSynced(row.id);
        }
      } catch {
        // offline — keep pending
      }
    })();
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.background.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={Colors.brand.teal} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background.primary },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="explore" />
        <Stack.Screen name="game/session" />
        <Stack.Screen name="profile/index" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
