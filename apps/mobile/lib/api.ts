import { createWorldlyClient } from "@worldly/api-client";
import { router } from "expo-router";
import { tokenStorage } from "./auth/tokenStorage";

const baseURL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export const api = createWorldlyClient({
  baseURL,
  getToken: () => tokenStorage.get(),
  onUnauthorized: async () => {
    await tokenStorage.clear();
    router.replace("/(auth)/login");
  },
});

export { baseURL as API_URL };
