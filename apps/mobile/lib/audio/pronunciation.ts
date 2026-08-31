import { Audio } from "expo-av";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const cache = new Map<string, Audio.Sound>();

/**
 * Stream pronunciation MP3s from the web app's public/audio/ directory.
 * Does not bundle the ~200MB of MP3s into the app binary.
 */
export async function playPronunciation(
  iso3: string,
  type: "country" | "capital",
  voice: "joanna" | "matthew"
): Promise<void> {
  if (!iso3) return;

  const folder =
    type === "capital"
      ? voice === "matthew"
        ? "pronunciation-capitals2"
        : "pronunciation-capitals"
      : voice === "matthew"
        ? "pronunciation2"
        : "pronunciation";

  const url = `${BASE_URL}/audio/${folder}/${iso3.toLowerCase()}.mp3`;
  const cacheKey = `${folder}/${iso3}`;

  if (cache.size >= 30) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (firstKey) {
      const firstSound = cache.get(firstKey);
      try {
        await firstSound?.unloadAsync();
      } catch {
        // ignore
      }
      cache.delete(firstKey);
    }
  }

  let sound = cache.get(cacheKey);
  if (!sound) {
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: false }
    );
    sound = s;
    cache.set(cacheKey, sound);
  }

  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // network / decode failure — silent
  }
}

export async function unloadPronunciationCache(): Promise<void> {
  for (const sound of cache.values()) {
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  }
  cache.clear();
}
