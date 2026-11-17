import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { storage } from "./db";
import { demo } from "./demo";
it("persists reading and chapter records, and deletes only records belonging to a removed book", async () => {
  await storage.putBook({ ...demo, position: 1, scroll: 127 });
  await storage.putBook({ ...demo, id: "other" });
  await storage.putNote({
    id: "n1",
    bookId: demo.id,
    chapterId: "chapter-1",
    quote: "阅读",
    comment: "想法",
    start: 0,
    end: 2,
    createdAt: 1,
    color: "yellow",
  });
  await storage.putNote({
    id: "n2",
    bookId: "other",
    chapterId: "chapter-1",
    quote: "其他",
    comment: "",
    start: 0,
    end: 2,
    createdAt: 1,
    color: "yellow",
  });
  await storage.putAI({
    id: demo.id + ":chapter-1",
    messages: [{ id: "m", role: "user", content: "提问", createdAt: 1 }],
    summaries: [{ id: "s", content: "# 总结", createdAt: 1 }],
  });
  await storage.putAI({ id: "other:chapter-1", messages: [], summaries: [] });
  const saved = (await storage.books()).find((b) => b.id === demo.id)!;
  expect(saved.position).toBe(1);
  expect(saved.scroll).toBe(127);
  expect((await storage.ai(demo.id + ":chapter-1"))?.summaries[0].content).toBe(
    "# 总结",
  );
  await storage.deleteBook(demo.id);
  expect((await storage.books()).map((b) => b.id)).toEqual(["other"]);
  expect((await storage.notes()).map((n) => n.id)).toEqual(["n2"]);
  expect(await storage.ai(demo.id + ":chapter-1")).toBeUndefined();
  expect(await storage.ai("other:chapter-1")).toBeDefined();
});
