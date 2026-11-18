// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSpeechReader } from "./useSpeechReader";
import { defaultSpeechConfig } from "./speechConfig";
import type { SpeechConfig } from "./types";

vi.mock("./ttsStream", async () => {
  const actual =
    await vi.importActual<typeof import("./ttsStream")>("./ttsStream");
  return {
    ...actual,
    consumeTTS: async (
      _body: ReadableStream<Uint8Array>,
      onAudio: (data: string) => void | Promise<void>,
    ) => {
      await onAudio("AAAAAA==");
      // Keep a streamed response in flight while controls are exercised.
      await new Promise(() => {});
    },
  };
});

function createSourceStub() {
  return {
    buffer: null,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
}

class AudioContextStub {
  static instances: AudioContextStub[] = [];
  currentTime = 0;
  destination = {};
  sources: ReturnType<typeof createSourceStub>[] = [];
  resume = vi.fn(async () => {});
  suspend = vi.fn(async () => {});
  close = vi.fn(async () => {});
  constructor() {
    AudioContextStub.instances.push(this);
  }
  createBuffer() {
    return { duration: 1, copyToChannel: vi.fn() };
  }
  createBufferSource() {
    const source = createSourceStub();
    this.sources.push(source);
    return source;
  }
}

let speech: ReturnType<typeof useSpeechReader>;
let root: Root;
let host: HTMLDivElement;
let requests: {
  voice: string;
  text: string;
  signal: AbortSignal;
  config: SpeechConfig;
}[];

async function update(action: () => void) {
  await act(async () => {
    action();
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  requests = [];
  AudioContextStub.instances = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("AudioContext", AudioContextStub);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push({ ...JSON.parse(String(init.body)), signal: init.signal! });
      return new Response("");
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Harness() {
    speech = useSpeechReader("chapter-1");
    return null;
  }
  await update(() => root.render(createElement(Harness)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("replaces audible and buffered speech at the current body sentence when voice changes", async () => {
  await update(() => {
    void speech.readBody(
      [
        { text: "第一句。", start: 0, end: 4 },
        { text: "第二句。", start: 4, end: 8 },
      ],
      "正文",
      1,
    );
  });
  const previous = AudioContextStub.instances[0];
  previous.currentTime = 0.2;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60);
  });
  expect(speech.state.status).toBe("playing");
  await update(() => speech.setVoice("male"));
  expect(requests.map(({ voice, text }) => ({ voice, text }))).toEqual([
    { voice: "female", text: "第二句。" },
    { voice: "male", text: "第二句。" },
  ]);
  expect(requests[0].signal.aborted).toBe(true);
  expect(previous.sources[0].stop).toHaveBeenCalledOnce();
  expect(previous.close).toHaveBeenCalledOnce();
  expect(speech.state).toMatchObject({
    index: 1,
    start: 4,
    end: 8,
    kind: "body",
    status: "loading",
  });
  expect(localStorage.getItem("doubao-voice")).toBe("male");
});

it("preserves pause while changing voice and resumes AI speech with the new voice", async () => {
  await update(() => {
    void speech.read("总结第一句。总结第二句。", "AI 总结");
  });
  await update(() => {
    void speech.pause();
  });
  await update(() => speech.setVoice("male"));
  expect(speech.state.status).toBe("paused");
  expect(requests).toHaveLength(1);
  expect(requests[0].signal.aborted).toBe(true);
  expect(AudioContextStub.instances[1].suspend).toHaveBeenCalledOnce();
  await update(() => {
    void speech.resume();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(80);
  });
  expect(requests[1]).toMatchObject({ voice: "male", text: "总结第一句。" });
});

it("uses the latest voice after rapid changes, seeking, and starting another reading", async () => {
  await update(() => {
    void speech.read("第一句。第二句。", "对话");
  });
  await update(() => {
    speech.setVoice("male");
    speech.setVoice("female");
  });
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests.at(-1)?.voice).toBe("female");
  await update(() => speech.setVoice("male"));
  await update(() => {
    void speech.seek(1);
  });
  expect(requests.at(-1)).toMatchObject({ voice: "male", text: "第二句。" });
  await update(() => {
    speech.stop();
    speech.setVoice("female");
    void speech.read("新的总结。", "AI 总结");
  });
  expect(requests.at(-1)).toMatchObject({
    voice: "female",
    text: "新的总结。",
  });
});

it("applies saved model and voice IDs to the current sentence and subsequent seeking", async () => {
  await update(() => {
    void speech.read("第一句。第二句。", "正文");
  });
  const next = {
    url: "https://openspeech.bytedance.com/custom-stream",
    resource: "seed-icl-2.0",
    femaleVoice: "S_custom_female",
    maleVoice: "S_custom_male",
  };
  await update(() => speech.configure(next));
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests.at(-1)).toMatchObject({ text: "第一句。", config: next });
  expect(JSON.parse(localStorage.getItem("tts-config")!)).toEqual(next);
  await update(() => {
    void speech.seek(1);
  });
  expect(requests.at(-1)).toMatchObject({ text: "第二句。", config: next });
});

it("keeps a paused reading paused when model or voice IDs are saved", async () => {
  await update(() => {
    void speech.read("总结内容。", "AI 总结");
  });
  await update(() => {
    void speech.pause();
  });
  const next = { ...defaultSpeechConfig, femaleVoice: "custom_female" };
  await update(() => speech.configure(next));
  expect(speech.state.status).toBe("paused");
  expect(requests).toHaveLength(1);
  await update(() => {
    void speech.resume();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(80);
  });
  expect(requests.at(-1)?.config).toEqual(next);
});

it("loads server defaults without persisting them and keeps browser overrides on later default loads", async () => {
  const defaults = { ...defaultSpeechConfig, resource: "server-resource" };
  await update(() => speech.loadDefaults(defaults));
  expect(speech.config).toEqual(defaults);
  expect(localStorage.getItem("tts-config")).toBeNull();
  const custom = { ...defaults, femaleVoice: "custom_female" };
  await update(() => speech.configure(custom));
  await update(() => speech.loadDefaults(defaultSpeechConfig));
  expect(speech.config).toEqual(custom);
  expect(requests).toHaveLength(0);
});
