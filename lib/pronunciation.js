import { getEffectiveSoundVolume } from "@/lib/soundPrefs";

const pronunciationCache = new Map();

export function getCountryPronunciationUrl(iso3) {
  if (!iso3) return null;
  return `/audio/pronunciation/${iso3.toLowerCase()}.mp3`;
}

export function playCountryPronunciation(iso3) {
  if (typeof window === "undefined" || !iso3) return;

  const volume = getEffectiveSoundVolume();
  if (volume <= 0) return;

  const url = getCountryPronunciationUrl(iso3);
  let audio = pronunciationCache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = "auto";
    pronunciationCache.set(url, audio);
  }

  audio.volume = volume;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
