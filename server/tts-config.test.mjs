import { expect, test } from "vitest";
import { publicTTSConfig, resolveTTSConfig } from "./tts-config.mjs";

const defaults = {
  key: "server-only-secret",
  url: "https://voice.example.test/stream",
  resource: "seed-tts-2.0",
  voices: { female: "female-default", male: "male-default" },
};

test("public speech defaults include endpoint, model and voice IDs without credentials", () => {
  expect(publicTTSConfig(defaults)).toEqual({
    url: defaults.url,
    resource: "seed-tts-2.0",
    femaleVoice: "female-default",
    maleVoice: "male-default",
  });
  expect(resolveTTSConfig(undefined, defaults)).toEqual(
    publicTTSConfig(defaults),
  );
});

test("browser overrides change model and voice IDs while retaining unmodified defaults", () => {
  expect(
    resolveTTSConfig(
      {
        resource: " seed-icl-2.0 ",
        maleVoice: "S_custom_voice",
        key: "ignored",
        url: "https://voice.example.test/custom-stream",
      },
      defaults,
    ),
  ).toEqual({
    url: "https://voice.example.test/custom-stream",
    resource: "seed-icl-2.0",
    femaleVoice: "female-default",
    maleVoice: "S_custom_voice",
  });
});

test("rejects unsafe endpoints and never forwards the server secret to a different origin", () => {
  for (const url of [
    "http://voice.example.test/stream",
    "https://other.example.test/stream",
    "https://user:pass@voice.example.test/stream",
    "https://voice.example.test/stream#fragment",
    "file:///test",
    "not-a-url",
  ])
    expect(() => resolveTTSConfig({ url }, defaults)).toThrow();
  const local = { ...defaults, url: "http://127.0.0.1:3009/tts" };
  expect(
    resolveTTSConfig({ url: "http://127.0.0.1:3009/custom" }, local).url,
  ).toBe("http://127.0.0.1:3009/custom");
  expect(() =>
    resolveTTSConfig({ url: "http://127.0.0.1:3010/custom" }, local),
  ).toThrow(/地址和密钥/);
});

test("malformed IDs and configuration objects fail before creating an upstream request", () => {
  for (const input of [
    null,
    [],
    "model",
    { resource: "bad\r\nheader" },
    { maleVoice: {} },
    { femaleVoice: "x".repeat(161) },
  ])
    expect(() => resolveTTSConfig(input, defaults)).toThrow();
});
