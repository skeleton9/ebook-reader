import {
  Volume2,
  Pause,
  Play,
  Square,
  X,
  SkipBack,
  SkipForward,
  LocateFixed,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { useSpeechReader } from "./useSpeechReader";
export function SpeechPlayer({
  speech,
}: {
  speech: ReturnType<typeof useSpeechReader>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const root = useRef<HTMLElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDraft(null);
    setMore(false);
  }, [speech.state.title, speech.state.total, speech.open]);
  useEffect(() => {
    if (speech.state.error || !speech.supported) setMore(true);
  }, [speech.state.error, speech.supported]);
  useEffect(() => {
    if (!more) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setMore(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMore(false);
        moreButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [more]);
  if (!speech.open) return null;
  const { state } = speech;
  const active = ["loading", "playing", "paused"].includes(state.status);
  const position = draft ?? state.index;
  const commit = (value: number) => {
    setDraft(null);
    if (
      value !== state.index ||
      state.status === "done" ||
      state.status === "error"
    )
      void speech.seek(value);
  };
  const status = {
    idle: "",
    loading: "缓冲中",
    playing: "播放中",
    paused: "已暂停",
    done: "已读完",
    error: "播放失败",
  }[state.status];
  const toggle = () => {
    if (state.status === "paused") void speech.resume();
    else if (active) void speech.pause();
    else void speech.seek(state.status === "done" ? 0 : state.index);
  };
  return (
    <section ref={root} className="speech-player" aria-label="豆包语音朗读控制">
      <div className="speech-source" title={state.title}>
        <Volume2 size={15} />
        <span>{state.title || "语音朗读"}</span>
      </div>
      <div className="speech-transport">
        <button
          aria-label="上一句"
          title="上一句"
          disabled={!state.total || state.index === 0}
          onClick={() => void speech.previous()}
        >
          <SkipBack size={15} />
        </button>
        <button
          className="speech-toggle"
          disabled={!state.total || !speech.supported}
          aria-label={
            state.status === "paused"
              ? "继续朗读"
              : active
                ? "暂停朗读"
                : "重新朗读"
          }
          title={
            state.status === "paused"
              ? "继续朗读"
              : active
                ? "暂停朗读"
                : "重新朗读"
          }
          onClick={toggle}
        >
          {state.status === "playing" || state.status === "loading" ? (
            <Pause size={15} />
          ) : (
            <Play size={15} />
          )}
        </button>
        <button
          aria-label="下一句"
          title="下一句"
          disabled={!state.total || state.index >= state.total - 1}
          onClick={() => void speech.next()}
        >
          <SkipForward size={15} />
        </button>
      </div>
      <div className="speech-track">
        <input
          type="range"
          min={0}
          max={Math.max(0, state.total - 1)}
          step={1}
          value={position}
          disabled={state.total < 2}
          aria-label="朗读进度"
          aria-valuetext={`第 ${position + 1} 句，共 ${state.total} 句：${speech.preview(position)}`}
          onChange={(event) => setDraft(Number(event.target.value))}
          onPointerUp={(event) => commit(Number(event.currentTarget.value))}
          onPointerCancel={() => setDraft(null)}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              commit(Number(event.currentTarget.value));
          }}
          onBlur={(event) => {
            if (draft !== null) commit(Number(event.currentTarget.value));
          }}
        />
        <span title={`第 ${position + 1} 句，共 ${state.total} 句`}>
          {state.total ? `${position + 1}/${state.total}` : "—"}
        </span>
        {draft !== null && (
          <div className="speech-preview" role="status">
            <b>松开跳转 · 第 {position + 1} 句</b>
            <p>{speech.preview(draft)}</p>
          </div>
        )}
      </div>
      <span
        className={`speech-status ${state.error ? "speech-error" : ""}`}
        role="status"
      >
        {status}
      </span>
      <div className="speech-more-wrap">
        <button
          aria-label="更多朗读选项"
          ref={moreButton}
          title="更多朗读选项"
          aria-expanded={more}
          aria-controls="speech-more"
          onClick={() => setMore(!more)}
        >
          <MoreHorizontal size={17} />
        </button>
        {more && (
          <div
            id="speech-more"
            className="speech-more-menu"
            role="region"
            aria-label="朗读选项"
          >
            <strong>{state.title || "豆包语音朗读"}</strong>
            {!speech.supported ? (
              <p role="alert" className="speech-error">
                当前浏览器不支持流式音频播放，请使用 Chrome 或 Edge。
              </p>
            ) : (
              <>
                {state.error ? (
                  <p className="speech-error" role="alert">
                    {state.error}
                  </p>
                ) : (
                  <p className="speech-sentence">
                    {state.sentence ||
                      (state.status === "done"
                        ? "本次内容已读完。"
                        : "正在准备语音…")}
                  </p>
                )}
                <label>
                  语速
                  <select
                    aria-label="朗读语速"
                    value={speech.rate}
                    onChange={(event) =>
                      speech.setRate(Number(event.target.value))
                    }
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}×
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  音色
                  <select
                    aria-label="朗读音色"
                    value={speech.voice}
                    onChange={(event) => speech.setVoice(event.target.value)}
                  >
                    <option value="female">女声</option>
                    <option value="male">男声</option>
                  </select>
                </label>
                {state.kind === "body" && (
                  <button
                    className="speech-menu-action"
                    aria-pressed={speech.follow}
                    onClick={() => speech.setFollow(!speech.follow)}
                  >
                    <LocateFixed size={14} />
                    {speech.follow ? "正在跟随正文" : "跟随当前句"}
                  </button>
                )}
                <button
                  className="speech-menu-action"
                  disabled={!state.total}
                  onClick={() => void speech.seek(state.index)}
                >
                  <RotateCcw size={14} />
                  重读当前句
                </button>
                <button
                  className="speech-menu-action"
                  aria-label="停止朗读"
                  disabled={!active}
                  onClick={speech.stop}
                >
                  <Square size={14} />
                  停止朗读
                </button>
                <small>
                  豆包流式合成 ·
                  跳转按句定位，暂停时跳转保持暂停。切换音色从当前句重新朗读，语速作用于后续音频。
                </small>
              </>
            )}
          </div>
        )}
      </div>
      <button
        aria-label="关闭朗读"
        title="停止并关闭朗读"
        onClick={speech.stop}
      >
        <X size={15} />
      </button>
    </section>
  );
}
