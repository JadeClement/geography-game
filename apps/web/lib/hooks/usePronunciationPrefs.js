import { useCallback, useEffect, useState } from "react";
import {
  getPronunciationVoiceId,
  setPronunciationVoiceId,
  subscribePronunciationPrefs,
} from "@/lib/pronunciationPrefs";
import {
  DEFAULT_PRONUNCIATION_VOICE_ID,
  getPronunciationVoiceById,
  PRONUNCIATION_VOICES,
} from "@/lib/pronunciationVoices";

export function usePronunciationPrefs() {
  const [voiceId, setVoiceIdState] = useState(DEFAULT_PRONUNCIATION_VOICE_ID);

  useEffect(() => {
    setVoiceIdState(getPronunciationVoiceId());
    return subscribePronunciationPrefs(() => {
      setVoiceIdState(getPronunciationVoiceId());
    });
  }, []);

  const setVoiceId = useCallback((nextVoiceId) => {
    setPronunciationVoiceId(nextVoiceId);
  }, []);

  return {
    voiceId,
    voice: getPronunciationVoiceById(voiceId),
    voices: PRONUNCIATION_VOICES,
    setVoiceId,
  };
}
