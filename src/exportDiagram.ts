type Format = "png" | "svg";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Let the browser finish consuming the URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportDiagram(source: string, format: Format) {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = parsed.documentElement;
  const bounds = svg.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number);
  if (
    parsed.querySelector("parsererror") ||
    svg.localName !== "svg" ||
    !bounds ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    bounds[2] <= 0 ||
    bounds[3] <= 0
  ) {
    throw Error("无法读取图表尺寸，请尝试重新生成图表。");
  }
  const [x, y, width, height] = bounds;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.style.maxWidth = "none";
  const background = parsed.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  for (const [key, value] of Object.entries({
    x,
    y,
    width,
    height,
    fill: "#ffffff",
  }))
    background.setAttribute(key, String(value));
  svg.prepend(background);
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const filename = `页间图表-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (format === "svg") {
    download(blob, `${filename}.svg`);
    return;
  }

  await document.fonts.ready;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const padding = 16;
    const fullWidth = width + padding * 2;
    const fullHeight = height + padding * 2;
    // Export the complete diagram at 2x, within practical canvas memory limits.
    const scale = Math.min(
      2,
      16384 / Math.max(fullWidth, fullHeight),
      Math.sqrt(32_000_000 / (fullWidth * fullHeight)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(fullWidth * scale));
    canvas.height = Math.max(1, Math.ceil(fullHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("当前浏览器无法导出 PNG，请下载 SVG 格式。");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, fullWidth, fullHeight);
    context.drawImage(image, padding, padding, width, height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(Error("PNG 生成失败，请下载 SVG 格式。")),
        "image/png",
      ),
    );
    download(png, `${filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
