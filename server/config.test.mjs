import { test } from "vitest";
import assert from "node:assert/strict";
import { readConfig } from "./config.mjs";

test("production and development use their respective configured ports", () => {
  const env = { PORT: "5178", DEV_API_PORT: "3008" };
  assert.equal(readConfig(env).port, 5178);
  assert.equal(readConfig(env, true).port, 3008);
  assert.throws(() => readConfig({ PORT: "invalid" }), /端口/);
});

test("text and speech settings are independent and accept custom endpoints and voices", () => {
  const config = readConfig({
    AI_BASE_URL: "https://example.test/api/v3/chat/completions/",
    AI_MODEL: "text-model",
    AI_API_KEY: "test-text-key",
    DOUBAO_TTS_API_KEY: "test-speech-key",
    DOUBAO_TTS_URL: "https://voice.example.test/stream",
    DOUBAO_TTS_RESOURCE_ID: "test-resource",
    DOUBAO_TTS_FEMALE_VOICE: "female-test",
    DOUBAO_TTS_MALE_VOICE: "male-test",
  });
  assert.equal(config.ai.base, "https://example.test/api/v3");
  assert.equal(config.ai.model, "text-model");
  assert.equal(config.ai.key, "test-text-key");
  assert.deepEqual(config.tts, {
    key: "test-speech-key",
    url: "https://voice.example.test/stream",
    resource: "test-resource",
    voices: { female: "female-test", male: "male-test" },
  });
});
