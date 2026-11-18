import { fromMarkdown } from "mdast-util-from-markdown";

export function markdownSpeechText(markdown: string): string {
  type Node = { type: string; value?: string; children?: Node[] };
  function text(node: Node): string {
    if (
      ["code", "html", "image", "definition", "thematicBreak"].includes(
        node.type,
      )
    )
      return "";
    if (node.type === "text" || node.type === "inlineCode")
      return node.value || "";
    return (
      (node.children || []).map(text).join("") +
      (["paragraph", "heading", "listItem", "blockquote"].includes(node.type)
        ? "\n"
        : "")
    );
  }
  return text(fromMarkdown(markdown))
    .replace(/^\s*\|?[\s:|-]+\|\s*$/gm, "")
    .replace(/\|/g, "，")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function bodySpeechText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,pre").forEach((node) => node.remove());
  doc
    .querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,tr,br")
    .forEach((node) => node.append(doc.createTextNode("\n")));
  return doc.body.textContent?.trim() || "";
}

export type SpeechSegment = { text: string; start?: number; end?: number };
export function segmentSpeechText(text: string): SpeechSegment[] {
  const result: SpeechSegment[] = [];
  for (const match of text.matchAll(/[^。！？!?；;\n]+[。！？!?；;\n]*/gu)) {
    const trimmed = match[0].trim();
    let position = match.index! + match[0].indexOf(trimmed);
    const chars = Array.from(trimmed);
    for (let i = 0; i < chars.length; i += 140) {
      const value = chars.slice(i, i + 140).join("");
      if (/[^\p{P}\p{Z}\p{C}\s]/u.test(value))
        result.push({
          text: value,
          start: position,
          end: position + value.length,
        });
      position += value.length;
    }
  }
  return result;
}
export function speechChunks(text: string): string[] {
  return segmentSpeechText(text).map((segment) => segment.text);
}

// Map spoken text to the original DOM's UTF-16 offsets. Added paragraph breaks
// aren't counted in the original offsets, and skipped code still occupies space.
export function bodySpeechPlan(html: string): SpeechSegment[] {
  // Match article.innerHTML's fragment parser. DOMParser's full-document
  // parser discards whitespace before the first element, shifting every anchor.
  const root = document.createElement("article");
  root.innerHTML = html;
  const fragments: { plain: number; raw: number; length: number }[] = [];
  let plain = "",
    raw = 0;
  const blocks = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "BLOCKQUOTE",
    "TR",
    "BR",
    "PRE",
  ]);
  function visit(node: Node, skip = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || "";
      if (!skip) {
        fragments.push({ plain: plain.length, raw, length: value.length });
        plain += value;
      }
      raw += value.length;
      return;
    }
    const element = node as Element;
    const block = blocks.has(element.tagName);
    if (block) plain += "\n";
    const excluded =
      skip || ["SCRIPT", "STYLE", "PRE"].includes(element.tagName);
    node.childNodes.forEach((child) => visit(child, excluded));
    if (block) plain += "\n";
  }
  visit(root);
  return segmentSpeechText(plain).flatMap((segment) => {
    const first = fragments.find(
      (f) => f.plain + f.length > segment.start! && f.plain <= segment.start!,
    );
    const last = fragments.find(
      (f) => f.plain < segment.end! && f.plain + f.length >= segment.end!,
    );
    return first && last
      ? [
          {
            text: segment.text,
            start: first.raw + segment.start! - first.plain,
            end: last.raw + segment.end! - last.plain,
          },
        ]
      : [];
  });
}
export function segmentAtOffset(segments: SpeechSegment[], offset: number) {
  const index = segments.findIndex((segment) => (segment.end ?? 0) > offset);
  return index < 0 ? Math.max(0, segments.length - 1) : index;
}

export function rangeForOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let first: Text | null = null;
  let firstOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!first && offset + node.length > start) {
      first = node;
      firstOffset = start - offset;
    }
    if (first && offset + node.length >= end) {
      const range = document.createRange();
      range.setStart(first, firstOffset);
      range.setEnd(node, end - offset);
      return range;
    }
    offset += node.length;
  }
  return null;
}
