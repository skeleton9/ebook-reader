import { useEffect, type RefObject } from "react";
import { rangeForOffsets } from "./speech";
import type { useSpeechReader } from "./useSpeechReader";
type HighlightWindow = Window & {
  Highlight?: new (...ranges: Range[]) => unknown;
};
type HighlightCSS = typeof CSS & {
  highlights?: {
    set: (name: string, value: unknown) => void;
    delete: (name: string) => void;
  };
};
export function useSpeechHighlight(
  root: RefObject<HTMLElement | null>,
  scroll: RefObject<HTMLElement | null>,
  speech: ReturnType<typeof useSpeechReader>,
  revision: unknown,
) {
  const { state, follow } = speech;
  useEffect(() => {
    const article = root.current;
    const container = scroll.current;
    if (!article || !container) return;
    const registry =
      typeof CSS !== "undefined" ? (CSS as HighlightCSS).highlights : undefined;
    const Highlight = (window as HighlightWindow).Highlight;
    registry?.delete("speech-current");
    article
      .querySelectorAll("[data-speech-current]")
      .forEach((node) => node.removeAttribute("data-speech-current"));
    if (
      state.kind !== "body" ||
      !["playing", "paused"].includes(state.status) ||
      state.start === undefined ||
      state.end === undefined
    )
      return;
    const range = rangeForOffsets(article, state.start, state.end);
    if (!range) return;
    const parent = range.startContainer.parentElement;
    const candidate = parent?.closest("p,li,h1,h2,h3,h4,h5,h6,blockquote,div");
    const block = candidate && article.contains(candidate) ? candidate : parent;
    block?.setAttribute("data-speech-current", "true");
    if (registry && Highlight) {
      registry.set("speech-current", new Highlight(range));
      article.removeAttribute("data-speech-fallback");
    } else {
      article.setAttribute("data-speech-fallback", "true");
    }
    if (follow) {
      const rect = range.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      const player = document
        .querySelector(".speech-player")
        ?.getBoundingClientRect();
      const bottom =
        player &&
        player.bottom > viewport.top &&
        player.top < viewport.bottom &&
        rect.right > player.left &&
        rect.left < player.right
          ? Math.min(viewport.bottom, player.top)
          : viewport.bottom;
      if (rect.top < viewport.top + 28 || rect.bottom > bottom - 40) {
        container.scrollTo({
          top:
            container.scrollTop +
            rect.top -
            viewport.top -
            Math.max(100, bottom - viewport.top) * 0.3,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      }
    }
    return () => {
      registry?.delete("speech-current");
      block?.removeAttribute("data-speech-current");
    };
  }, [
    root,
    scroll,
    state.kind,
    state.index,
    state.start,
    state.end,
    state.status,
    follow,
    revision,
  ]);
}
