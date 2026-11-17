import JSZip from "jszip";
import fs from "node:fs/promises";
const zip = new JSZip();
zip.file("mimetype", "application/epub+zip");
zip.file(
  "META-INF/container.xml",
  '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
zip.file(
  "OPS/book.opf",
  '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">between-pages-test</dc:identifier><dc:title>一页之间 · 导入体验</dc:title><dc:creator>页间</dc:creator><dc:language>zh-CN</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>',
);
zip.file(
  "OPS/nav.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol><li><a href="ch1.xhtml">第一章 留白的意义</a></li><li><a href="ch2.xhtml">第二章 记录一个念头</a></li></ol></nav></body></html>',
);
zip.file(
  "OPS/ch1.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章 留白的意义</h1><p>阅读需要留白，思考才能发生。书页上的空白不是缺失，而是给读者的一份邀请。</p><p>当我们不再急着翻到下一页，一个念头才有时间生根。请试着选中这段文字，写下自己的评论。</p><p>这是用于验证本地 EPUB 导入的原创测试书籍。</p></body></html>',
);
zip.file(
  "OPS/ch2.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章 记录一个念头</h1><p>记录不只是保存原文，也是在保存当时的自己。写下一句感受，未来重读时，就能再次走近那个瞬间。</p></body></html>',
);
await fs.mkdir("test-results", { recursive: true });
await fs.writeFile(
  "test-results/一页之间.epub",
  await zip.generateAsync({ type: "nodebuffer" }),
);
console.log("Created test-results/一页之间.epub");
