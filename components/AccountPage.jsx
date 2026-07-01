"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import UserAvatar from "@/components/UserAvatar";
import Input from "@/components/ui/Input";
import ValidationMessage from "@/components/ui/ValidationMessage";
import { AVATAR_COLORS, hashAvatarColor, resizeImageFile } from "@/lib/avatars";
import { loadCountriesGeoJSON } from "@/lib/countries";
import { getFlagUrl } from "@/lib/flags";
import { useUserProfile } from "@/lib/hooks/useUserProfile";
import { cn } from "@/lib/cn";
import {
  accountAvatarPreview,
  accountAvatarTab,
  accountAvatarTabActive,
  accountAvatarTabs,
  accountColorGrid,
  accountColorSwatch,
  accountFlagGrid,
  accountFlagImage,
  accountFlagLabel,
  accountFlagOption,
  accountFlagSearch,
  accountUploadArea,
  accountUploadBtn,
  accountUploadHint,
  secondaryBtn,
  settingsBack,
  settingsContent,
  settingsPage,
  settingsSection,
  settingsSectionDescription,
  settingsSectionTitle,
  settingsTitle,
} from "@/lib/ui";

const AVATAR_TABS = [
  { id: "color", label: "Color" },
  { id: "flag", label: "Flag" },
  { id: "image", label: "Upload" },
];

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const { profile, avatar, refresh } = useUserProfile();
  const signedIn = status === "authenticated";

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [avatarTab, setAvatarTab] = useState("color");
  const [draftAvatar, setDraftAvatar] = useState(null);
  const [avatarError, setAvatarError] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);

  const [flagCountries, setFlagCountries] = useState([]);
  const [flagQuery, setFlagQuery] = useState("");
  const fileInputRef = useRef(null);

  const userName = session?.user?.name || session?.user?.email || "";
  const currentUsername = session?.user?.username ?? profile?.username ?? "";

  useEffect(() => {
    if (profile?.username) {
      setUsername(profile.username);
    } else if (session?.user?.username) {
      setUsername(session.user.username);
    }
  }, [profile?.username, session?.user?.username]);

  useEffect(() => {
    if (!avatar) return;
    const fallbackColor = avatar.color || hashAvatarColor(currentUsername || userName);
    setDraftAvatar({
      type: avatar.type,
      color: avatar.type === "color" ? fallbackColor : avatar.color,
      flag: avatar.flag,
      image: avatar.image,
    });
    setAvatarTab(avatar.type === "image" ? "image" : avatar.type === "flag" ? "flag" : "color");
    if (avatar.type === "image" && avatar.image) {
      setUploadPreview(avatar.image);
    }
  }, [avatar, currentUsername, userName]);

  useEffect(() => {
    let cancelled = false;

    loadCountriesGeoJSON()
      .then((geo) => {
        if (cancelled) return;
        const countries = geo.countries
          .filter((country) => country.iso2)
          .map((country) => ({ iso2: country.iso2, name: country.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setFlagCountries(countries);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFlags = useMemo(() => {
    const query = flagQuery.trim().toLowerCase();
    if (!query) return flagCountries;
    return flagCountries.filter(
      (country) =>
        country.name.toLowerCase().includes(query) ||
        country.iso2.toLowerCase().includes(query)
    );
  }, [flagCountries, flagQuery]);

  const previewAvatar = useMemo(() => {
    if (!draftAvatar) return avatar;
    if (avatarTab === "color") {
      return { type: "color", color: draftAvatar.color, flag: null, image: null };
    }
    if (avatarTab === "flag") {
      return { type: "flag", color: null, flag: draftAvatar.flag, image: null };
    }
    return {
      type: "image",
      color: null,
      flag: null,
      image: uploadPreview ?? draftAvatar.image,
    };
  }, [avatar, avatarTab, draftAvatar, uploadPreview]);

  const syncSessionAvatar = useCallback(
    async (user) => {
      await update({
        username: user.username,
        avatarType: user.avatar.type,
        avatarColor: user.avatar.color,
        avatarFlag: user.avatar.flag,
      });
    },
    [update]
  );

  const handleUsernameSave = async (event) => {
    event.preventDefault();
    setUsernameError("");
    setUsernameMessage("");

    const trimmed = username.trim();
    if (trimmed === currentUsername) return;

    setUsernameSaving(true);
    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not update username.");
      }

      await syncSessionAvatar(data.user);
      setUsername(data.user.username);
      setUsernameMessage("Username updated.");
      await refresh();
    } catch (saveError) {
      setUsernameError(saveError.message || "Could not update username.");
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleAvatarSave = async () => {
    setAvatarError("");
    setAvatarMessage("");

    let payload;
    if (avatarTab === "color") {
      payload = { type: "color", color: draftAvatar?.color };
    } else if (avatarTab === "flag") {
      payload = { type: "flag", flag: draftAvatar?.flag };
    } else {
      payload = { type: "image", image: uploadPreview ?? draftAvatar?.image };
    }

    setAvatarSaving(true);
    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not update avatar.");
      }

      await syncSessionAvatar(data.user);
      setDraftAvatar(data.user.avatar);
      if (data.user.avatar.type === "image") {
        setUploadPreview(data.user.avatar.image);
      }
      setAvatarMessage("Avatar updated.");
      await refresh();
    } catch (saveError) {
      setAvatarError(saveError.message || "Could not update avatar.");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarError("");
    setAvatarMessage("");
    try {
      const dataUrl = await resizeImageFile(file);
      setUploadPreview(dataUrl);
      setDraftAvatar({ type: "image", color: null, flag: null, image: dataUrl });
      setAvatarTab("image");
    } catch (uploadError) {
      setAvatarError(uploadError.message || "Could not upload image.");
    }
  };

  if (!signedIn) {
    return (
      <div className={settingsPage}>
        <AppHeader />
        <main className={settingsContent}>
          <Link href="/" className={settingsBack}>
            Play now!
          </Link>
          <h1 className={settingsTitle}>Account</h1>
          <p className={settingsSectionDescription}>Sign in to manage your profile.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={settingsPage}>
      <AppHeader />
      <main className={settingsContent}>
        <Link href="/" className={settingsBack}>
          Play now!
        </Link>

        <h1 className={settingsTitle}>Account</h1>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Avatar</h2>
          <p className={settingsSectionDescription}>
            Choose a color, pick a country flag, or upload your own photo.
          </p>

          <div className={accountAvatarPreview}>
            <UserAvatar
              avatar={previewAvatar}
              name={userName}
              username={currentUsername}
              size="lg"
            />
          </div>

          <div className={accountAvatarTabs} role="tablist" aria-label="Avatar type">
            {AVATAR_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={avatarTab === tab.id}
                className={accountAvatarTabActive(avatarTab === tab.id)}
                onClick={() => setAvatarTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {avatarTab === "color" && (
            <div className={accountColorGrid} role="listbox" aria-label="Avatar colors">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="option"
                  aria-selected={draftAvatar?.color === color}
                  className={accountColorSwatch(color, draftAvatar?.color === color)}
                  onClick={() =>
                    setDraftAvatar({ type: "color", color, flag: null, image: null })
                  }
                  aria-label={color}
                />
              ))}
            </div>
          )}

          {avatarTab === "flag" && (
            <>
              <div className={accountFlagSearch}>
                <Input
                  label="Search flags"
                  id="account-flag-search"
                  type="search"
                  value={flagQuery}
                  onChange={(event) => setFlagQuery(event.target.value)}
                  placeholder="Country name or code…"
                />
              </div>
              <div className={accountFlagGrid} role="listbox" aria-label="Country flags">
                {filteredFlags.map((country) => (
                  <button
                    key={country.iso2}
                    type="button"
                    role="option"
                    aria-selected={draftAvatar?.flag === country.iso2}
                    className={accountFlagOption(draftAvatar?.flag === country.iso2)}
                    onClick={() =>
                      setDraftAvatar({
                        type: "flag",
                        color: null,
                        flag: country.iso2,
                        image: null,
                      })
                    }
                  >
                    <img
                      src={getFlagUrl(country.iso2, 80)}
                      alt=""
                      className={accountFlagImage}
                    />
                    <span className={accountFlagLabel}>{country.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {avatarTab === "image" && (
            <div className={accountUploadArea}>
              {uploadPreview ? (
                <UserAvatar
                  avatar={{ type: "image", image: uploadPreview }}
                  name={userName}
                  username={currentUsername}
                  size="md"
                />
              ) : (
                <p className={accountUploadHint}>JPEG, PNG, or WebP · max 512 KB</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleFileChange}
              />
              <button
                type="button"
                className={accountUploadBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadPreview ? "Choose a different photo" : "Choose photo"}
              </button>
            </div>
          )}

          {avatarError && <ValidationMessage type="error" message={avatarError} />}
          {avatarMessage && <ValidationMessage type="success" message={avatarMessage} />}

          <button
            type="button"
            className={cn(secondaryBtn, "mt-4")}
            disabled={avatarSaving}
            onClick={handleAvatarSave}
          >
            {avatarSaving ? "Saving…" : "Save avatar"}
          </button>
        </section>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Username</h2>
          <p className={settingsSectionDescription}>
            Your public handle on the scoreboard. Usernames are unique and can be changed
            anytime.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleUsernameSave}>
            <Input
              label="Username"
              id="account-username"
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setUsernameError("");
                setUsernameMessage("");
              }}
              autoComplete="username"
              helpText="3–20 letters, numbers, or underscores."
              error={usernameError}
            />
            {usernameMessage && (
              <ValidationMessage type="success" message={usernameMessage} />
            )}
            <button
              type="submit"
              className={secondaryBtn}
              disabled={usernameSaving || username.trim() === currentUsername}
            >
              {usernameSaving ? "Saving…" : "Save username"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
