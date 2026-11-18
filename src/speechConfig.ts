import type { SpeechConfig } from "./types";

export const defaultSpeechConfig: SpeechConfig = {
  url: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  resource: "seed-tts-2.0",
  femaleVoice: "zh_female_vv_uranus_bigtts",
  maleVoice: "zh_male_m191_uranus_bigtts",
};

export function normalizeSpeechConfig(
  value: Partial<SpeechConfig>,
): SpeechConfig {
  const field = (key: keyof SpeechConfig) =>
    typeof value[key] === "string" && value[key]!.trim()
      ? value[key]!.trim()
      : defaultSpeechConfig[key];
  return {
    url: field("url"),
    resource: field("resource"),
    femaleVoice: field("femaleVoice"),
    maleVoice: field("maleVoice"),
  };
}
