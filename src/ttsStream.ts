export async function consumeTTS(
  body: ReadableStream<Uint8Array>,
  onAudio: (data: string) => void | Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "",
    complete = false,
    received = false;
  const parse = async (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.code === 20000000) {
      complete = true;
      return;
    }
    if (event.code !== 0)
      throw Error(
        `豆包语音合成失败（${event.code}），请检查语音服务权限与额度。`,
      );
    if (event.data) {
      received = true;
      await onAudio(event.data);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        await parse(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    if (pending.trim()) await parse(pending);
    if (!complete || !received)
      throw Error("语音流中断或未返回音频，请重新朗读。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function decodePCM(bytes: Uint8Array) {
  if (bytes.length % 2) throw Error("PCM 音频长度无效");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}
