export const PRONUNCIATION_VOICES = [
  {
    id: "joanna",
    label: "Joanna",
    description: "US English, female",
    folder: "pronunciation",
    capitalFolder: "pronunciation-capitals",
  },
  {
    id: "matthew",
    label: "Matthew",
    description: "US English, male",
    folder: "pronunciation2",
    capitalFolder: "pronunciation-capitals2",
  },
];

export const DEFAULT_PRONUNCIATION_VOICE_ID = "joanna";

export const PRONUNCIATION_KINDS = {
  COUNTRY: "country",
  CAPITAL: "capital",
};

export function getPronunciationVoiceById(voiceId) {
  return (
    PRONUNCIATION_VOICES.find((voice) => voice.id === voiceId) ??
    PRONUNCIATION_VOICES[0]
  );
}

export function getPronunciationFolderForVoiceId(voiceId, kind = PRONUNCIATION_KINDS.COUNTRY) {
  const voice = getPronunciationVoiceById(voiceId);
  return kind === PRONUNCIATION_KINDS.CAPITAL ? voice.capitalFolder : voice.folder;
}
