import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { publicTTSConfig, resolveTTSConfig } from "./tts-config.mjs";
import { randomUUID } from "node:crypto";
const { base: defaultBase, model: defaultModel, key: defaultKey } = config.ai;
const ttsKey = config.tts.key;
const ttsVoices = config.tts.voices;
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (!["localhost", "127.0.0.1"].includes(u.hostname))
        return res.status(403).json({ error: "仅允许本机访问" });
    } catch {
      return res.sendStatus(403);
    }
  }
  next();
});
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    configured: Boolean(defaultKey),
    model: defaultModel,
    base: defaultBase,
    ttsConfigured: Boolean(ttsKey),
    ttsConfig: publicTTSConfig(config.tts),
  }),
);
app.post("/api/tts", async (req, res) => {
  if (!ttsKey)
    return res
      .status(503)
      .json({ error: "请在服务端 .env 配置 DOUBAO_TTS_API_KEY 后重启服务。" });
  const { text, voice = "female", config: overrides } = req.body;
  if (
    typeof text !== "string" ||
    !text.trim() ||
    Array.from(text).length > 500 ||
    !Object.hasOwn(ttsVoices, voice)
  )
    return res
      .status(400)
      .json({ error: "朗读文本或音色参数无效（单段最多 500 字）。" });
  let speechConfig;
  try {
    speechConfig = resolveTTSConfig(overrides, config.tts);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  res.on("close", () => controller.abort());
  try {
    const upstream = await fetch(speechConfig.url, {
      redirect: "error",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": ttsKey,
        "X-Api-Resource-Id": speechConfig.resource,
        "X-Api-Request-Id": randomUUID(),
      },
      body: JSON.stringify({
        req_params: {
          text,
          speaker:
            voice === "male"
              ? speechConfig.maleVoice
              : speechConfig.femaleVoice,
          audio_params: { format: "pcm", sample_rate: 24000 },
        },
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return res.status(502).json({
        error: `豆包语音接口返回 ${upstream.status}，请检查密钥、服务权限及额度。`,
      });
    }
    res.set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    for await (const chunk of upstream.body) {
      if (!res.write(chunk))
        await new Promise((resolve) => res.once("drain", resolve));
    }
    res.end();
  } catch {
    if (!res.headersSent)
      res.status(502).json({ error: "无法连接豆包语音，请稍后重试。" });
    else res.end();
  } finally {
    clearTimeout(timeout);
  }
});
app.post("/api/chat", async (req, res) => {
  const { messages, config = {} } = req.body;
  const key = config.key || defaultKey;
  if (!key)
    return res
      .status(400)
      .json({ error: "请先在 AI 设置中填写 API Key，或配置服务端环境变量。" });
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > 100 ||
    messages.some(
      (m) =>
        !["system", "user", "assistant"].includes(m.role) ||
        typeof m.content !== "string",
    )
  )
    return res.status(400).json({ error: "对话参数无效" });
  let base;
  try {
    base = new URL(config.base || defaultBase);
    if (!(
      base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
    ))
      throw Error();
  } catch {
    return res
      .status(400)
      .json({ error: "接口地址须为 HTTPS，或本机 HTTP 地址。" });
  }
  if (!config.key && base.origin !== new URL(defaultBase).origin)
    return res.status(400).json({
      error:
        "更换服务商时，请填写该服务商的 API Key。服务端密钥仅用于其原配置地址。",
    });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  res.on("close", () => controller.abort());
  try {
    const upstream = await fetch(
      base.href.replace(/\/$/, "") + "/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model || defaultModel,
          messages,
          stream: true,
          ...(base.hostname.endsWith("volces.com")
            ? { thinking: { type: "disabled" } }
            : {}),
        }),
        signal: controller.signal,
      },
    );
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return res.status(502).json({
        error: `AI 接口返回 ${upstream.status}，请检查地址、模型、密钥及额度。`,
      });
    }
    if (!upstream.headers.get("content-type")?.includes("text/event-stream")) {
      await upstream.body?.cancel();
      return res.status(502).json({
        error: "AI 接口未返回 SSE 流，请使用支持 stream 的兼容接口。",
      });
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    for await (const chunk of upstream.body) {
      if (!res.write(chunk))
        await new Promise((resolve) => res.once("drain", resolve));
    }
    res.end();
  } catch (e) {
    if (!res.headersSent)
      res.status(502).json({
        error:
          e.name === "AbortError"
            ? "请求超时或已取消，请重试。"
            : "无法连接 AI 接口，请检查网络与接口地址。",
      });
    else res.end();
  } finally {
    clearTimeout(timeout);
  }
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.listen(config.port, "127.0.0.1", () =>
  console.log(`页间服务 http://127.0.0.1:${config.port}`),
);
