import { getEffectiveSoundVolume } from "@/lib/soundPrefs";
import {
  getPronunciationFolderForVoiceId,
  PRONUNCIATION_KINDS,
} from "@/lib/pronunciationVoices";
import { getPronunciationVoiceId } from "@/lib/pronunciationPrefs";

export function getPronunciationUrl(
  iso3,
  { voiceId = getPronunciationVoiceId(), kind = PRONUNCIATION_KINDS.COUNTRY } = {}
) {
  if (!iso3) return null;
  const folder = getPronunciationFolderForVoiceId(voiceId, kind);
  return `/audio/${folder}/${iso3.toLowerCase()}.mp3`;
}

export function playPronunciation(
  iso3,
  { kind = PRONUNCIATION_KINDS.COUNTRY, voiceId, volumeOverride } = {}
) {
  if (typeof window === "undefined" || !iso3) return;

  const volume =
    volumeOverride != null
      ? Math.min(1, Math.max(0, volumeOverride))
      : getEffectiveSoundVolume();
  if (volume <= 0) return;

  const selectedVoiceId = voiceId ?? getPronunciationVoiceId();
  const url = getPronunciationUrl(iso3, { voiceId: selectedVoiceId, kind });
  const audio = new Audio(url);

  audio.volume = volume;
  audio.play().catch(() => {});
}

export function playCountryPronunciation(iso3, options = {}) {
  playPronunciation(iso3, { ...options, kind: PRONUNCIATION_KINDS.COUNTRY });
}

export function playCapitalPronunciation(iso3, options = {}) {
  playPronunciation(iso3, { ...options, kind: PRONUNCIATION_KINDS.CAPITAL });
}

/** Plays a sample country name, ignoring mute (for settings preview). */
export function previewCountryPronunciation(iso3 = "USA", { voiceId, volume } = {}) {
  playCountryPronunciation(iso3, {
    voiceId,
    volumeOverride: volume ?? 1,
  });
}

/** Plays a sample capital name, ignoring mute (for settings preview). */
export function previewCapitalPronunciation(iso3 = "USA", { voiceId, volume } = {}) {
  playCapitalPronunciation(iso3, {
    voiceId,
    volumeOverride: volume ?? 1,
  });
}
