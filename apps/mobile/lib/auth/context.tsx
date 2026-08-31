import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../api";
import { tokenStorage } from "./tokenStorage";
import { clearLocalUserData } from "../storage/db";
import { useSettingsStore } from "../../store/settingsStore";

export type MobileUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  emailVerified: boolean;
  avatarType: string;
  avatarColor: string | null;
  avatarFlag: string | null;
};

type AuthContextValue = {
  user: MobileUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loginWithBiometricToken: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const baseURL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const me = await api.getMe();
    setUser(me.user as MobileUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenStorage.get();
        if (!token) {
          if (!cancelled) setUser(null);
          return;
        }
        const me = await api.getMe();
        if (!cancelled) setUser(me.user as MobileUser);
      } catch {
        await tokenStorage.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    await tokenStorage.set(result.token, result.expiresAt);
    if (useSettingsStore.getState().biometricEnabled) {
      await tokenStorage.setBiometricToken(result.token);
    }
    setUser(result.user as MobileUser);
  }, []);

  const loginWithBiometricToken = useCallback(async () => {
    const expiredToken = await tokenStorage.getBiometricToken();
    if (!expiredToken) {
      throw new Error("No biometric session. Sign in with email.");
    }
    const res = await fetch(`${baseURL}/api/mobile/auth/biometric-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiredToken }),
    });
    if (res.status === 401) {
      await tokenStorage.clearBiometricToken();
      useSettingsStore.getState().setBiometricEnabled(false);
      throw new Error("Biometric session expired. Sign in with email.");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Biometric sign-in failed");
    }
    const result = await res.json();
    await tokenStorage.set(result.token, result.expiresAt);
    await tokenStorage.setBiometricToken(result.token);
    setUser(result.user as MobileUser);
  }, []);

  const register = useCallback(
    async (name: string, username: string, email: string, password: string) => {
      const res = await fetch(`${baseURL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Registration failed");
      }
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    const keepBiometric = useSettingsStore.getState().biometricEnabled;
    if (!keepBiometric) {
      try {
        await api.logout();
      } catch {
        // still clear local session
      }
      await tokenStorage.clearBiometricToken();
    }
    // Keep server mobile_token_hash when Face ID is on so biometric-refresh works.
    // Clear only the session SecureStore keys — not worldly_biometric_token.
    await tokenStorage.clear();
    await clearLocalUserData();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refreshUser,
      loginWithBiometricToken,
    }),
    [
      user,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
      loginWithBiometricToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
