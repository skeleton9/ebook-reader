// Only public model/voice settings are exposed or accepted as browser overrides.
export function publicTTSConfig(tts) {
  return {
    url: tts.url,
    resource: tts.resource,
    femaleVoice: tts.voices.female,
    maleVoice: tts.voices.male,
  };
}

export function resolveTTSConfig(input = {}, defaults) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("语音配置格式无效");
  const config = publicTTSConfig(defaults);
  for (const key of ["resource", "femaleVoice", "maleVoice"]) {
    if (input[key] === undefined || input[key] === "") continue;
    if (
      typeof input[key] !== "string" ||
      !/^[A-Za-z0-9_.:-]{1,160}$/.test(input[key].trim())
    )
      throw Error(
        "语音模型和音色 ID 仅支持字母、数字、点、冒号、下划线和短横线（最多 160 字符）",
      );
    config[key] = input[key].trim();
  }
  const address =
    input.url === undefined || input.url === "" ? defaults.url : input.url;
  let url;
  try {
    if (typeof address !== "string" || address.length > 2048) throw Error();
    url = new URL(address.trim());
    if (
      url.username ||
      url.password ||
      url.hash ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
    )
      throw Error();
  } catch {
    throw Error("语音接口地址须为完整 HTTPS URL，或本机 HTTP URL");
  }
  // Do not forward the server's secret to a different service chosen by a browser.
  if (url.origin !== new URL(defaults.url).origin)
    throw Error(
      "更换语音服务域名时，请同步修改服务端 .env 中的地址和密钥后重启",
    );
  config.url = url.href;
  return config;
}
