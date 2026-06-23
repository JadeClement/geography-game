import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SOUND_VOLUME,
  getEffectiveSoundVolume,
  getSoundMuted,
  getSoundVolume,
  setSoundMuted,
  setSoundVolume,
  subscribeSoundPrefs,
} from "@/lib/soundPrefs";

export function useSoundPrefs() {
  const [volume, setVolumeState] = useState(DEFAULT_SOUND_VOLUME);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setVolumeState(getSoundVolume());
    setMutedState(getSoundMuted());

    return subscribeSoundPrefs(() => {
      setVolumeState(getSoundVolume());
      setMutedState(getSoundMuted());
    });
  }, []);

  const setVolume = useCallback((nextVolume) => {
    setSoundVolume(nextVolume);
  }, []);

  const setMuted = useCallback((nextMuted) => {
    setSoundMuted(nextMuted);
  }, []);

  const toggleMuted = useCallback(() => {
    setSoundMuted(!getSoundMuted());
  }, []);

  return {
    volume,
    muted,
    effectiveVolume: muted ? 0 : volume,
    setVolume,
    setMuted,
    toggleMuted,
    getEffectiveVolume: getEffectiveSoundVolume,
  };
}
