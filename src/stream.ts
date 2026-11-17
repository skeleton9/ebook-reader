import type { AIConfig } from "./types";
export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onToken: (s: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent = false;
  const event = (block: string) => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    if (data.trim() === "[DONE]") {
      doneEvent = true;
      return;
    }
    const json = JSON.parse(data);
    if (json.error) throw Error(json.error.message || "AI 输出错误");
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length")
      throw Error("达到模型输出上限，请重新生成或缩小范围");
    if (choice?.finish_reason === "content_filter")
      throw Error("接口停止了此次生成");
    const token = choice?.delta?.content;
    if (typeof token === "string") onToken(token);
    if (choice?.finish_reason === "stop") doneEvent = true;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        event(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
      if (done) {
        if (buffer.trim()) event(buffer);
        break;
      }
    }
    if (!doneEvent) throw Error("输出连接中断，可保留已生成内容并重试");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function generate(
  messages: { role: string; content: string }[],
  config: AIConfig,
  signal: AbortSignal,
  onToken: (s: string) => void,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, config }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Error(data.error || `请求失败 (${response.status})`);
  }
  if (!response.body) throw Error("浏览器未提供流式响应");
  await readSSE(response.body, onToken);
}
