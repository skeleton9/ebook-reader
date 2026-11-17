import JSZip from "jszip";
import DOMPurify from "dompurify";
import type { Book } from "./types";
const xml = (s: string) => {
  const d = new DOMParser().parseFromString(s, "application/xml");
  if (d.querySelector("parsererror")) throw Error("EPUB 的 XML 文件损坏");
  return d;
};
const local = (d: Document | Element, name: string) =>
  Array.from(d.getElementsByTagName("*")).filter((e) => e.localName === name);
export function resolvePath(base: string, href: string) {
  return decodeURIComponent(
    new URL(href, "https://epub.local/" + base).pathname.slice(1),
  );
}
export async function parseEpub(file: File): Promise<Book> {
  if (!/\.epub$/i.test(file.name)) throw Error("请选择 .epub 格式的电子书");
  if (file.size > 80 * 1024 * 1024) throw Error("当前支持 80 MB 以内的 EPUB");
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p: string) => {
    const f = zip.file(p);
    if (!f) throw Error(`EPUB 缺少文件：${p}`);
    return f.async("string");
  };
  if (zip.file("META-INF/encryption.xml")) {
    const encryption = await read("META-INF/encryption.xml");
    if (
      /EncryptedData/.test(encryption) &&
      !/embedding|obfuscat/i.test(encryption)
    )
      throw Error("不支持 DRM 加密的电子书，请导入无加密 EPUB");
  }
  const container = xml(await read("META-INF/container.xml"));
  const opfPath = local(container, "rootfile")[0]?.getAttribute("full-path");
  if (!opfPath) throw Error("找不到 EPUB 内容清单");
  const opf = xml(await read(opfPath));
  const manifest = local(opf, "item");
  const items = new Map(manifest.map((i) => [i.getAttribute("id"), i]));
  const titles = new Map<string, string>();
  const nav = manifest.find((i) =>
    i.getAttribute("properties")?.split(" ").includes("nav"),
  );
  if (nav) {
    const navPath = resolvePath(opfPath, nav.getAttribute("href")!);
    const d = new DOMParser().parseFromString(await read(navPath), "text/html");
    d.querySelectorAll("a[href]").forEach((a) =>
      titles.set(
        resolvePath(navPath, a.getAttribute("href")!).split("#")[0],
        a.textContent?.trim() || "",
      ),
    );
  } else {
    const ncx = manifest.find(
      (i) => i.getAttribute("media-type") === "application/x-dtbncx+xml",
    );
    if (ncx) {
      const p = resolvePath(opfPath, ncx.getAttribute("href")!);
      const d = xml(await read(p));
      for (const n of local(d, "navPoint")) {
        const src = local(n, "content")[0]?.getAttribute("src");
        if (src)
          titles.set(
            resolvePath(p, src).split("#")[0],
            local(n, "text")[0]?.textContent || "",
          );
      }
    }
  }
  const assets = new Map<string, string>();
  let assetBytes = 0;
  let chapterBytes = 0;
  async function image(p: string) {
    if (assets.has(p)) return assets.get(p)!;
    const f = zip.file(p);
    if (!f) return "";
    const bytes = await f.async("uint8array");
    assetBytes += bytes.length;
    if (assetBytes > 50 * 1024 * 1024)
      throw Error("书籍图片解压后过大（上限 50 MB）");
    const ext = p.split(".").pop()?.toLowerCase();
    const mime = (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
      } as Record<string, string>
    )[ext || ""];
    if (!mime) return "";
    const data = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
    });
    assets.set(p, data);
    return data;
  }
  const chapters = [];
  for (const ref of local(opf, "itemref")) {
    if (ref.getAttribute("linear") === "no") continue;
    const item = items.get(ref.getAttribute("idref"));
    if (!item) continue;
    if (!/html/.test(item.getAttribute("media-type") || "")) continue;
    const p = resolvePath(opfPath, item.getAttribute("href")!).split("#")[0];
    const raw = await read(p);
    chapterBytes += raw.length;
    if (chapterBytes > 15_000_000)
      throw Error("书籍正文过大（解压上限 1500 万字符）");
    const d = new DOMParser().parseFromString(raw, "text/html");
    d.querySelectorAll(
      "script,style,link,iframe,object,embed,form,svg,video,audio",
    ).forEach((e) => e.remove());
    for (const img of Array.from(d.querySelectorAll("img"))) {
      const src = img.getAttribute("src") || "";
      img.removeAttribute("srcset");
      img.setAttribute("src", await image(resolvePath(p, src)));
    }
    d.querySelectorAll("*").forEach((e) => {
      e.removeAttribute("style");
      e.removeAttribute("class");
      e.removeAttribute("id");
    });
    d.querySelectorAll("a").forEach((e) => {
      e.removeAttribute("href");
    });
    const html = DOMPurify.sanitize(d.body.innerHTML, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["input", "button", "textarea", "select", "form"],
      FORBID_ATTR: ["srcset", "background", "ping", "poster"],
    });
    const clean = new DOMParser().parseFromString(html, "text/html");
    chapters.push({
      id: p,
      title:
        titles.get(p) ||
        d.querySelector("h1,h2,h3,title")?.textContent?.trim() ||
        `第 ${chapters.length + 1} 节`,
      html,
      text: clean.body.textContent || "",
    });
  }
  if (!chapters.length) throw Error("未找到可阅读章节，文件可能已加密或损坏");
  const coverItem =
    manifest.find((i) =>
      i.getAttribute("properties")?.includes("cover-image"),
    ) ||
    items.get(
      local(opf, "meta")
        .find((i) => i.getAttribute("name") === "cover")
        ?.getAttribute("content") || "",
    );
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return {
    id: Array.from(new Uint8Array(hash))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(""),
    title:
      local(opf, "title")[0]?.textContent || file.name.replace(/\.epub$/i, ""),
    author: local(opf, "creator")[0]?.textContent || "佚名",
    cover: coverItem
      ? await image(resolvePath(opfPath, coverItem.getAttribute("href")!))
      : undefined,
    chapters,
    file: buffer,
    addedAt: Date.now(),
    position: 0,
    scroll: 0,
  };
}
