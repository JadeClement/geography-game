import {
  DEFAULT_PRONUNCIATION_VOICE_ID,
  getPronunciationFolderForVoiceId,
  getPronunciationVoiceById,
  PRONUNCIATION_VOICES,
} from "@/lib/pronunciationVoices";

export const PRONUNCIATION_VOICE_STORAGE_KEY = "geography-pronunciation-voice";

const PRONUNCIATION_PREFS_EVENT = "geography:pronunciation-prefs-change";

export function getPronunciationVoiceId() {
  if (typeof window === "undefined") return DEFAULT_PRONUNCIATION_VOICE_ID;
  try {
    const raw = window.localStorage.getItem(PRONUNCIATION_VOICE_STORAGE_KEY);
    if (!raw) return DEFAULT_PRONUNCIATION_VOICE_ID;
    return getPronunciationVoiceById(raw).id;
  } catch {
    return DEFAULT_PRONUNCIATION_VOICE_ID;
  }
}

export function setPronunciationVoiceId(voiceId) {
  if (typeof window === "undefined") return;
  const voice = getPronunciationVoiceById(voiceId);
  try {
    window.localStorage.setItem(PRONUNCIATION_VOICE_STORAGE_KEY, voice.id);
    dispatchPronunciationPrefsChange();
  } catch {
    // ignore quota / private mode
  }
}

export function getPronunciationFolder() {
  return getPronunciationFolderForVoiceId(getPronunciationVoiceId());
}

export function dispatchPronunciationPrefsChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRONUNCIATION_PREFS_EVENT));
}

export function subscribePronunciationPrefs(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PRONUNCIATION_PREFS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(PRONUNCIATION_PREFS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export { PRONUNCIATION_VOICES };
