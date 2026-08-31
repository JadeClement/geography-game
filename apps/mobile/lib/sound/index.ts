import { Audio } from "expo-av";

let correctSound: Audio.Sound | null = null;
let incorrectSound: Audio.Sound | null = null;
let isLoaded = false;

export const soundManager = {
  async load(): Promise<void> {
    if (isLoaded) return;
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    const [c, i] = await Promise.all([
      Audio.Sound.createAsync(require("../../assets/audio/correct.wav"), {
        shouldPlay: false,
      }),
      Audio.Sound.createAsync(require("../../assets/audio/incorrect.wav"), {
        shouldPlay: false,
      }),
    ]);
    correctSound = c.sound;
    incorrectSound = i.sound;
    isLoaded = true;
  },

  async playCorrect(): Promise<void> {
    if (!correctSound) return;
    try {
      await correctSound.setPositionAsync(0);
      await correctSound.playAsync();
    } catch {
      // ignore playback errors
    }
  },

  async playIncorrect(): Promise<void> {
    if (!incorrectSound) return;
    try {
      await incorrectSound.setPositionAsync(0);
      await incorrectSound.playAsync();
    } catch {
      // ignore playback errors
    }
  },

  async unload(): Promise<void> {
    try {
      await correctSound?.unloadAsync();
      await incorrectSound?.unloadAsync();
    } catch {
      // ignore
    }
    correctSound = null;
    incorrectSound = null;
    isLoaded = false;
  },
};
