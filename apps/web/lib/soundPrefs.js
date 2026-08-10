export const SOUND_VOLUME_STORAGE_KEY = "geography-sound-volume";
export const SOUND_MUTED_STORAGE_KEY = "geography-sound-muted";
export const DEFAULT_SOUND_VOLUME = 0.7;

const SOUND_PREFS_EVENT = "geography:sound-prefs-change";

export function clampSoundVolume(volume) {
  if (!Number.isFinite(volume)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, volume));
}

export function getSoundVolume() {
  if (typeof window === "undefined") return DEFAULT_SOUND_VOLUME;
  try {
    const raw = window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_SOUND_VOLUME;
    return clampSoundVolume(Number(raw));
  } catch {
    return DEFAULT_SOUND_VOLUME;
  }
}

export function setSoundVolume(volume) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(clampSoundVolume(volume)));
    dispatchSoundPrefsChange();
  } catch {
    // ignore quota / private mode
  }
}

export function getSoundMuted() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, muted ? "true" : "false");
    dispatchSoundPrefsChange();
  } catch {
    // ignore quota / private mode
  }
}

export function getEffectiveSoundVolume() {
  if (getSoundMuted()) return 0;
  return getSoundVolume();
}

export function dispatchSoundPrefsChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SOUND_PREFS_EVENT));
}

export function subscribeSoundPrefs(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SOUND_PREFS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SOUND_PREFS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
