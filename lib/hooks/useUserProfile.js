"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

export function useUserProfile() {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated" && session?.user;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setProfile(null);
      return null;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/users/profile");
      if (!response.ok) {
        throw new Error("Could not load profile.");
      }
      const data = await response.json();
      setProfile(data.user ?? null);
      return data.user ?? null;
    } catch {
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setProfile(null);
      return undefined;
    }

    let cancelled = false;

    fetch("/api/users/profile")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) {
          setProfile(data?.user ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn, session?.user?.username]);

  const sessionAvatar = signedIn
    ? {
        type: session.user.avatarType ?? "color",
        color: session.user.avatarColor ?? null,
        flag: session.user.avatarFlag ?? null,
        image: null,
      }
    : null;

  const avatar = profile?.avatar ?? sessionAvatar;

  return {
    profile,
    avatar,
    loading,
    refresh,
    signedIn,
  };
}
