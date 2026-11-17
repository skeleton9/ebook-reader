export const readingFonts = [
  {
    id: "serif",
    name: "宋体 · 衬线",
    family: '"Noto Serif SC", "Source Han Serif SC", SimSun, serif',
  },
  {
    id: "sans",
    name: "黑体 · 无衬线",
    family: '"Microsoft YaHei", "PingFang SC", sans-serif',
  },
  { id: "kai", name: "楷体", family: 'KaiTi, STKaiti, "Noto Serif SC", serif' },
  {
    id: "system",
    name: "系统字体",
    family: 'system-ui, "Microsoft YaHei", sans-serif',
  },
];

export const readingBackgrounds = [
  { id: "auto", name: "随主题", color: "" },
  { id: "white", name: "纸白", color: "#ffffff" },
  { id: "paper", name: "暖纸", color: "#f4ecd9" },
  { id: "green", name: "浅绿", color: "#e4efdf" },
  { id: "night", name: "夜读", color: "#202924" },
];

// Choose readable text colors even for a user-picked background.
export function readingColors(background: string) {
  if (!/^#[0-9a-f]{6}$/i.test(background)) return {};
  const rgb = [1, 3, 5].map(
    (offset) => parseInt(background.slice(offset, offset + 2), 16) / 255,
  );
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance =
    0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const light = luminance > 0.179;
  const ink = light ? (luminance > 0.3 ? "#142018" : "#000000") : "#ffffff";
  return {
    "--reading-bg": background,
    "--reading-ink": ink,
    "--reading-muted":
      luminance > 0.4 ? "#35433b" : luminance < 0.1 ? "#d0dbd4" : ink,
    "--reading-rule": light ? "#35433b33" : "#d0dbd433",
  };
}
