import { getEffectiveSoundVolume } from "@/lib/soundPrefs";

const CORRECT_SOUND_URL = "/sounds/correct-chime.wav";
const INCORRECT_SOUND_URL = "/sounds/incorrect-chime.wav";

const sounds = {
  correct: null,
  incorrect: null,
};

function getSound(kind) {
  if (typeof window === "undefined") return null;
  if (!sounds[kind]) {
    const url = kind === "correct" ? CORRECT_SOUND_URL : INCORRECT_SOUND_URL;
    sounds[kind] = new Audio(url);
    sounds[kind].preload = "auto";
  }
  return sounds[kind];
}

function playGameSound(kind, { volumeOverride } = {}) {
  const audio = getSound(kind);
  if (!audio) return;

  const volume =
    volumeOverride != null
      ? Math.min(1, Math.max(0, volumeOverride))
      : getEffectiveSoundVolume();
  if (volume <= 0) return;

  audio.volume = volume;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function playCorrectSound() {
  playGameSound("correct");
}

export function playIncorrectSound() {
  playGameSound("incorrect");
}

/** Plays the chime at the given volume, ignoring mute (for settings preview). */
export function previewCorrectSound(volume) {
  playGameSound("correct", { volumeOverride: volume });
}

export function previewIncorrectSound(volume) {
  playGameSound("incorrect", { volumeOverride: volume });
}
