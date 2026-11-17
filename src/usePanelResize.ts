import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";

const key = "ai-panel-width";
const defaultWidth = () =>
  window.innerWidth >= 1600 ? 410 : window.innerWidth <= 1200 ? 320 : 362;
const limits = () => {
  const viewport = window.innerWidth;
  const navigation =
    viewport <= 980 ? 0 : viewport <= 1200 ? 218 : viewport >= 1600 ? 270 : 248;
  return {
    min: 280,
    max: Math.max(280, Math.min(760, viewport - navigation - 320)),
  };
};
const clamp = (value: number) =>
  Math.round(Math.max(limits().min, Math.min(limits().max, value)));

export function usePanelResize() {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return clamp(
        saved > 0 && Number.isFinite(saved) ? saved : defaultWidth(),
      );
    } catch {
      return clamp(defaultWidth());
    }
  });
  const [resizing, setResizing] = useState(false);
  const preferred = useRef(width);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const current = useRef(width);
  const update = (value: number) => {
    current.current = clamp(value);
    setWidth(current.current);
  };
  const save = () => {
    preferred.current = current.current;
    try {
      localStorage.setItem(key, String(current.current));
    } catch {
      /* Keep resizing available if storage is disabled. */
    }
  };
  useEffect(() => {
    const resize = () => {
      current.current = clamp(preferred.current);
      setWidth(current.current);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    setResizing(false);
    save();
  };
  const reset = () => {
    update(defaultWidth());
    save();
  };
  const adjust = (delta: number) => {
    update(current.current + delta);
    save();
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") adjust(step);
    else if (event.key === "ArrowRight") adjust(-step);
    else if (event.key === "Home") {
      update(limits().min);
      save();
    } else if (event.key === "End") {
      update(limits().max);
      save();
    } else if (event.key === "Enter") reset();
    else return;
    event.preventDefault();
  };
  return {
    width,
    resizing,
    adjust,
    separatorProps: {
      role: "separator" as const,
      tabIndex: 0,
      "aria-label": "调整 AI 侧栏宽度",
      "aria-controls": "ai-panel",
      "aria-orientation": "vertical" as const,
      "aria-valuemin": limits().min,
      "aria-valuemax": limits().max,
      "aria-valuenow": width,
      "aria-valuetext": `${width} 像素`,
      title: "左右拖动调整宽度；双击恢复默认；方向键微调",
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || window.innerWidth <= 640) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: current.current };
        setResizing(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (drag.current)
          update(drag.current.width + drag.current.x - event.clientX);
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onDoubleClick: reset,
      onKeyDown: handleKey,
    },
  };
}
