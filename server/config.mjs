import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Only this project's .env is loaded, independent of the launch directory.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

export function readConfig(env, development = false) {
  const port = Number(
    development ? env.DEV_API_PORT || 3001 : env.PORT || 5173,
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("服务端口必须是 1–65535 的整数");
  return {
    port,
    ai: {
      base: (env.AI_BASE_URL || "https://api.openai.com/v1")
        .replace(/\/chat\/completions\/?$/, "")
        .replace(/\/$/, ""),
      model: env.AI_MODEL || "gpt-4.1-mini",
      key: env.AI_API_KEY || "",
    },
    tts: {
      key: env.DOUBAO_TTS_API_KEY || "",
      url:
        env.DOUBAO_TTS_URL ||
        "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
      resource: env.DOUBAO_TTS_RESOURCE_ID || "seed-tts-2.0",
      voices: {
        female: env.DOUBAO_TTS_FEMALE_VOICE || "zh_female_vv_uranus_bigtts",
        male: env.DOUBAO_TTS_MALE_VOICE || "zh_male_m191_uranus_bigtts",
      },
    },
  };
}
export const config = readConfig(process.env, process.argv.includes("--dev"));
