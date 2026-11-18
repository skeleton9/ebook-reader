// @vitest-environment jsdom
import { expect, it } from "vitest";
import { markdownSpeechText, bodySpeechText, speechChunks } from "./speech";
import { consumeTTS, decodePCM } from "./ttsStream";
import { bodySpeechPlan, segmentAtOffset, rangeForOffsets } from "./speech";
import { playingSegment } from "./speechTimeline";
it("keeps EPUB fragment leading whitespace in speech offsets", () => {
  const html =
    "\n  <div>\n    <br>\n  </div>\n\n  <p><br></p>\n  <h1>章节标题</h1>\n  <p>第一句话。第二句话。</p>";
  const article = document.createElement("article");
  article.innerHTML = html;
  const plan = bodySpeechPlan(html);
  for (const segment of plan)
    expect(
      rangeForOffsets(article, segment.start!, segment.end!)?.toString(),
    ).toBe(segment.text);
});
it("skips punctuation-only passages while preserving following anchors", () => {
  const html = "\n  <p>…………</p><p>这是下一句。</p>";
  const root = document.createElement("article");
  root.innerHTML = html;
  const plan = bodySpeechPlan(html);
  expect(plan.map((s) => s.text)).toEqual(["这是下一句。"]);
  expect(rangeForOffsets(root, plan[0].start!, plan[0].end!)?.toString()).toBe(
    "这是下一句。",
  );
});
it("anchors sentences across inline elements and skips code without losing DOM offsets", () => {
  const html =
    "<h1>标题</h1><p>你好<strong>世界</strong>！同一句。</p><pre>同一句。</pre><p>同一句。🙂继续。</p>";
  const plan = bodySpeechPlan(html);
  const root = document.createElement("article");
  root.innerHTML = html;
  expect(plan.map((s) => s.text)).toEqual([
    "标题",
    "你好世界！",
    "同一句。",
    "同一句。",
    "🙂继续。",
  ]);
  for (const segment of plan)
    expect(
      rangeForOffsets(root, segment.start!, segment.end!)?.toString(),
    ).toBe(segment.text);
  expect(plan[3].start).toBe(root.textContent!.lastIndexOf("同一句。"));
  expect(segmentAtOffset(plan, plan[3].start! + 1)).toBe(3);
  // Annotation marks can be added without changing the spoken sentence anchor.
  root.innerHTML = html.replace("世界", "<mark>世界</mark>");
  expect(rangeForOffsets(root, plan[1].start!, plan[1].end!)?.toString()).toBe(
    "你好世界！",
  );
});
it("highlights audible segments rather than buffered future segments, including gaps", () => {
  const timings = [
    { index: 2, start: 1, end: 3 },
    { index: 3, start: 3.4, end: 5 },
  ];
  expect(playingSegment(timings, 0)).toBeNull();
  expect(playingSegment(timings, 1)).toBe(2);
  expect(playingSegment(timings, 2.9)).toBe(2);
  expect(playingSegment(timings, 3.2)).toBeNull();
  expect(playingSegment(timings, 3.4)).toBe(3);
  expect(playingSegment(timings, 5)).toBeNull();
});
it("reads prose without Markdown, links, code or Mermaid syntax", () => {
  const result = markdownSpeechText(
    "# 核心观点\n\n**耐心**很重要，[原文](https://example.com)。\n\n```mermaid\nflowchart TD\nA-->B\n```\n\n- 慢下来\n- 多思考\n",
  );
  expect(result).toContain("耐心很重要，原文。");
  expect(result).toContain("慢下来");
  expect(result).not.toMatch(/flowchart|https|\*\*|-->/);
});
it("preserves paragraph boundaries and splits long Unicode text safely", () => {
  expect(bodySpeechText("<h1>章节</h1><p>第一段。</p><p>第二段。</p>")).toBe(
    "章节\n第一段。\n第二段。",
  );
  const input = "🙂".repeat(300) + "结束。";
  const chunks = speechChunks(input);
  expect(chunks.join("")).toBe(input);
  expect(chunks.every((chunk) => Array.from(chunk).length <= 140)).toBe(true);
});
it("decodes little-endian 16-bit PCM including signed sample limits", () => {
  expect(
    Array.from(decodePCM(new Uint8Array([0, 128, 0, 0, 255, 127]))),
  ).toEqual([-1, 0, 32767 / 32768]);
  expect(() => decodePCM(new Uint8Array([1]))).toThrow();
});
const body = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(new TextEncoder().encode(c)));
      controller.close();
    },
  });
it("streams audio frames across split JSON boundaries and validates completion", async () => {
  const audio: string[] = [];
  await consumeTTS(
    body(['{"code":0,"data":"AA', 'AA"}\r\n{"code":20000000}\n']),
    (chunk) => {
      audio.push(chunk);
    },
  );
  expect(audio).toEqual(["AAAA"]);
  await expect(
    consumeTTS(body(['{"code":0,"data":"AAAA"}\n']), () => {}),
  ).rejects.toThrow("中断");
});
it("rejects provider errors and empty finished streams", async () => {
  await expect(
    consumeTTS(body(['{"code":45000000}\n']), () => {}),
  ).rejects.toThrow("45000000");
  await expect(
    consumeTTS(body(['{"code":20000000}\n']), () => {}),
  ).rejects.toThrow("未返回音频");
});
