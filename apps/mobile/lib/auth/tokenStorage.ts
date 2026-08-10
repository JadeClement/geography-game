import * as SecureStore from "expo-secure-store";

const KEY = "worldly_token";
const EXPIRES_KEY = "worldly_token_expires";

export const tokenStorage = {
  async get(): Promise<string | null> {
    const expires = await SecureStore.getItemAsync(EXPIRES_KEY);
    if (expires && Date.now() > parseInt(expires, 10)) {
      await this.clear();
      return null;
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string, expiresAt: string): Promise<void> {
    await SecureStore.setItemAsync(KEY, token);
    await SecureStore.setItemAsync(
      EXPIRES_KEY,
      String(new Date(expiresAt).getTime())
    );
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
  },
};
