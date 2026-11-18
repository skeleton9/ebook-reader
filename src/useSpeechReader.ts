import { useEffect, useRef, useState } from "react";
import { segmentSpeechText, type SpeechSegment } from "./speech";
import { consumeTTS, decodePCM } from "./ttsStream";
import { playingSegment, type SpeechTiming } from "./speechTimeline";
import { defaultSpeechConfig, normalizeSpeechConfig } from "./speechConfig";
import type { SpeechConfig } from "./types";
type State = {
  status: "idle" | "loading" | "playing" | "paused" | "done" | "error";
  title: string;
  index: number;
  total: number;
  sentence: string;
  error: string;
  kind: "body" | "other";
  start?: number;
  end?: number;
};
const empty: State = {
  status: "idle",
  title: "",
  index: 0,
  total: 0,
  sentence: "",
  error: "",
  kind: "other",
};
type Job = {
  segments: SpeechSegment[];
  title: string;
  kind: "body" | "other";
  voice: string;
  config: SpeechConfig;
};
type Session = {
  controller: AbortController;
  context: AudioContext;
  sources: Set<AudioBufferSourceNode>;
  next: number;
  paused: boolean;
  timeline: SpeechTiming[];
  timer?: ReturnType<typeof setInterval>;
};
const saved = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
export function useSpeechReader(scope: string) {
  const [state, setState] = useState<State>(empty);
  const stateRef = useRef(state);
  const [open, setOpen] = useState(false);
  const [voice, setVoiceState] = useState(
    saved("doubao-voice", "female") === "male" ? "male" : "female",
  );
  const voiceRef = useRef(voice);
  const [config, setConfigState] = useState<SpeechConfig>(() => {
    try {
      return normalizeSpeechConfig(JSON.parse(saved("tts-config", "{}")) || {});
    } catch {
      return defaultSpeechConfig;
    }
  });
  const configRef = useRef(config);
  const hasCustomConfig = useRef(Boolean(saved("tts-config", "")));
  const [rate, setRate] = useState(() => {
    const r = Number(saved("doubao-rate", "1"));
    return r >= 0.5 && r <= 2 ? r : 1;
  });
  const [follow, setFollow] = useState(true);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const session = useRef<Session | null>(null);
  const job = useRef<Job | null>(null);
  const supported = "AudioContext" in window;
  function emit(patch: Partial<State>) {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  }
  function cancel() {
    const active = session.current;
    session.current = null;
    if (!active) return;
    clearInterval(active.timer);
    active.controller.abort();
    active.sources.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    void active.context.close().catch(() => {});
  }
  function stop() {
    cancel();
    job.current = null;
    emit(empty);
    setOpen(false);
  }
  useEffect(() => {
    stop();
    return stop;
  }, [scope]);
  useEffect(() => {
    const end = () => stop();
    window.addEventListener("pagehide", end);
    return () => window.removeEventListener("pagehide", end);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("doubao-voice", voice);
      localStorage.setItem("doubao-rate", String(rate));
    } catch {}
  }, [voice, rate]);
  async function launch(request: Job, index = 0, paused = false) {
    cancel();
    job.current = request;
    setOpen(true);
    if (!supported) return;
    const { segments, title, kind } = request;
    if (!segments.length) {
      emit({
        ...empty,
        status: "error",
        title,
        error: "这段内容没有可朗读文字。",
      });
      return;
    }
    index = Math.max(0, Math.min(index, segments.length - 1));
    emit({
      ...empty,
      title,
      kind,
      total: segments.length,
      index,
      sentence: segments[index].text,
      start: segments[index].start,
      end: segments[index].end,
      status: paused ? "paused" : "loading",
    });
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      emit({
        status: "error",
        error: "浏览器无法启动音频，请关闭其他播放任务后重试。",
      });
      return;
    }
    const active: Session = {
      context,
      controller: new AbortController(),
      sources: new Set(),
      next: 0,
      paused,
      timeline: [],
    };
    session.current = active;
    const signal = active.controller.signal;
    const tick = () => {
      if (session.current !== active || active.paused) return;
      const playing = playingSegment(active.timeline, context.currentTime);
      if (
        playing !== null &&
        (stateRef.current.index !== playing ||
          stateRef.current.status !== "playing")
      ) {
        const segment = segments[playing];
        emit({
          status: "playing",
          index: playing,
          sentence: segment.text,
          start: segment.start,
          end: segment.end,
        });
      } else if (playing === null && stateRef.current.status === "playing")
        emit({ status: "loading" });
    };
    active.timer = setInterval(tick, 60);
    try {
      if (paused) await context.suspend();
      else await context.resume();
      for (let i = index; i < segments.length; i++) {
        signal.throwIfAborted();
        while (active.next - context.currentTime > 12 || active.paused) {
          signal.throwIfAborted();
          await new Promise((r) => setTimeout(r, 80));
        }
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: segments[i].text,
            voice: request.voice,
            config: request.config,
          }),
          signal,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw Error(error.error || `语音请求失败（${response.status}）`);
        }
        if (!response.body) throw Error("未收到语音流");
        let carry = new Uint8Array(0);
        await consumeTTS(response.body, async (data) => {
          signal.throwIfAborted();
          while (active.next - context.currentTime > 12) {
            signal.throwIfAborted();
            await new Promise((r) => setTimeout(r, 80));
          }
          const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          const bytes = new Uint8Array(carry.length + raw.length);
          bytes.set(carry);
          bytes.set(raw, carry.length);
          const length = bytes.length - (bytes.length % 2);
          carry = bytes.slice(length);
          if (!length) return;
          const samples = decodePCM(bytes.subarray(0, length));
          const buffer = context.createBuffer(1, samples.length, 24000);
          buffer.copyToChannel(samples, 0);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = rateRef.current;
          source.connect(context.destination);
          const start = Math.max(active.next, context.currentTime + 0.04);
          active.next = start + buffer.duration / rateRef.current;
          const timing = active.timeline.at(-1);
          if (timing?.index === i) timing.end = active.next;
          else active.timeline.push({ index: i, start, end: active.next });
          active.sources.add(source);
          source.onended = () => {
            active.sources.delete(source);
            source.disconnect();
          };
          source.start(start);
        });
        if (carry.length) throw Error("语音数据不完整，请重试。");
      }
      while (active.sources.size) {
        signal.throwIfAborted();
        await new Promise((r) => setTimeout(r, 80));
      }
      if (session.current === active) {
        clearInterval(active.timer);
        await context.close();
        session.current = null;
        emit({
          status: "done",
          index: segments.length - 1,
          sentence: "",
          start: undefined,
          end: undefined,
        });
      }
    } catch (error) {
      if (signal.aborted) return;
      if (session.current === active) {
        cancel();
        emit({
          status: "error",
          error:
            error instanceof Error ? error.message : "语音播放失败，请重试。",
        });
      }
    }
  }
  function read(text: string, title: string) {
    setFollow(true);
    return launch({
      segments: segmentSpeechText(text),
      title,
      kind: "other",
      voice: voiceRef.current,
      config: configRef.current,
    });
  }
  function readBody(segments: SpeechSegment[], title: string, index = 0) {
    setFollow(true);
    return launch(
      {
        segments,
        title,
        kind: "body",
        voice: voiceRef.current,
        config: configRef.current,
      },
      index,
    );
  }
  function setVoice(value: string) {
    const next = value === "male" ? "male" : "female";
    if (next === voiceRef.current) return;
    voiceRef.current = next;
    setVoiceState(next);
    const request = job.current;
    if (!request) return;
    replaceJob({ ...request, voice: next });
  }
  function configure(value: SpeechConfig, persist = true) {
    const next = normalizeSpeechConfig(value);
    if (persist) {
      hasCustomConfig.current = true;
      try {
        localStorage.setItem("tts-config", JSON.stringify(next));
      } catch {}
    }
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof SpeechConfig] ===
          configRef.current[key as keyof SpeechConfig],
      )
    )
      return;
    configRef.current = next;
    setConfigState(next);
    if (job.current) replaceJob({ ...job.current, config: next });
  }
  function loadDefaults(value: SpeechConfig) {
    if (!hasCustomConfig.current) configure(value, false);
  }
  function replaceJob(updated: Job) {
    job.current = updated;
    const active = session.current;
    if (!active) return;
    const index =
      playingSegment(active.timeline, active.context.currentTime) ??
      stateRef.current.index;
    // Replace queued audio as well as in-flight synthesis, keeping the sentence
    // and pause state. Replaying or seeking later also uses the new voice.
    void launch(updated, index, active.paused);
  }
  function seek(index: number) {
    const request = job.current;
    if (!request) return;
    return launch(request, index, stateRef.current.status === "paused");
  }
  async function pause() {
    const active = session.current;
    if (!active) return;
    active.paused = true;
    emit({ status: "paused" });
    try {
      await active.context.suspend();
    } catch {}
  }
  async function resume() {
    const active = session.current;
    if (!active) return;
    try {
      await active.context.resume();
      if (session.current === active) {
        active.paused = false;
        emit({ status: "loading" });
      }
    } catch {}
  }
  return {
    state,
    open,
    supported,
    voice,
    setVoice,
    config,
    configure,
    loadDefaults,
    rate,
    setRate,
    follow,
    setFollow,
    read,
    readBody,
    pause,
    resume,
    stop,
    seek,
    preview: (index: number) => job.current?.segments[index]?.text || "",
    previous: () => seek(stateRef.current.index - 1),
    next: () => seek(stateRef.current.index + 1),
  };
}
