import * as SecureStore from "expo-secure-store";

const KEY = "worldly_token";
const EXPIRES_KEY = "worldly_token_expires";
/** Survives logout for Face ID re-auth. Never store passwords here. */
const BIOMETRIC_KEY = "worldly_biometric_token";

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
  /** Clears session token only — keeps biometric refresh token. */
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
  },
  async getBiometricToken(): Promise<string | null> {
    return SecureStore.getItemAsync(BIOMETRIC_KEY);
  },
  async setBiometricToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(BIOMETRIC_KEY, token);
  },
  async clearBiometricToken(): Promise<void> {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
  },
};
