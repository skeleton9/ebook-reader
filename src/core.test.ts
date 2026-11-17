// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseEpub, resolvePath } from "./epub";
import { readSSE } from "./stream";
describe("EPUB import", () => {
  it("resolves escaped and parent-relative asset paths", () => {
    expect(resolvePath("OPS/text/ch1.xhtml", "../images/a%20b.png")).toBe(
      "OPS/images/a b.png",
    );
  });
  it("reads namespaced metadata, spine order and EPUB3 navigation; strips executable content", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    );
    zip.file(
      "OPS/book.opf",
      '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>测试书籍</dc:title><dc:creator>作者</dc:creator></metadata><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
    );
    zip.file(
      "OPS/nav.xhtml",
      '<html><body><nav><a href="a.xhtml">目录标题</a></nav></body></html>',
    );
    zip.file(
      "OPS/a.xhtml",
      '<html><body><h1>甲</h1><p onclick="alert(1)">正文<script>alert(1)</script><img src="https://evil.test/a.png"/></p><iframe src="https://evil.test"/></body></html>',
    );
    zip.file(
      "OPS/b.xhtml",
      "<html><body><h1>乙</h1><p>第二节</p></body></html>",
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const file = {
      name: "test.epub",
      size: buffer.byteLength,
      arrayBuffer: async () => buffer,
    } as File;
    const book = await parseEpub(file);
    expect(book.title).toBe("测试书籍");
    expect(book.chapters.map((c) => c.id)).toEqual([
      "OPS/a.xhtml",
      "OPS/b.xhtml",
    ]);
    expect(book.chapters[0].title).toBe("目录标题");
    expect(book.chapters[0].html).not.toMatch(
      /script|onclick|iframe|evil\.test/,
    );
    expect(book.file).toBe(buffer);
  });
  it("rejects other formats before parsing", async () => {
    await expect(
      parseEpub({ name: "a.pdf", size: 10 } as File),
    ).rejects.toThrow(".epub");
  });
});
describe("SSE streaming", () => {
  const stream = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const x of chunks) c.enqueue(new TextEncoder().encode(x));
        c.close();
      },
    });
  it("handles arbitrary chunk boundaries and CRLF", async () => {
    let out = "";
    await readSSE(
      stream([
        'data: {"choices":[{"delta":{"content":"你"}}]}\r',
        '\n\r\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DO',
        "NE]\n\n",
      ]),
      (s) => (out += s),
    );
    expect(out).toBe("你好");
  });
  it("reports a truncated connection while keeping emitted tokens", async () => {
    let out = "";
    await expect(
      readSSE(
        stream(['data: {"choices":[{"delta":{"content":"已收到"}}]}\n\n']),
        (s) => (out += s),
      ),
    ).rejects.toThrow("中断");
    expect(out).toBe("已收到");
  });
  it("propagates provider errors", async () => {
    await expect(
      readSSE(stream(['data: {"error":{"message":"额度不足"}}\n\n']), () => {}),
    ).rejects.toThrow("额度不足");
  });
});
