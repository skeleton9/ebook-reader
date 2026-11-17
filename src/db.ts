import { openDB } from "idb";
import type { Book, Note, ChapterAI } from "./types";
const db = openDB("between-pages", 1, {
  upgrade(db) {
    db.createObjectStore("books", { keyPath: "id" });
    db.createObjectStore("notes", { keyPath: "id" });
    db.createObjectStore("ai", { keyPath: "id" });
  },
});
export const storage = {
  books: async (): Promise<Book[]> => (await db).getAll("books"),
  putBook: async (b: Book) => (await db).put("books", b),
  notes: async (): Promise<Note[]> => (await db).getAll("notes"),
  putNote: async (n: Note) => (await db).put("notes", n),
  deleteNote: async (id: string) => (await db).delete("notes", id),
  ai: async (id: string): Promise<ChapterAI | undefined> =>
    (await db).get("ai", id),
  putAI: async (a: ChapterAI) => (await db).put("ai", a),
  async deleteBook(id: string) {
    const d = await db;
    const tx = d.transaction(["books", "notes", "ai"], "readwrite");
    await tx.objectStore("books").delete(id);
    for (const n of (await tx.objectStore("notes").getAll()) as Note[])
      if (n.bookId === id) await tx.objectStore("notes").delete(n.id);
    for (const a of (await tx.objectStore("ai").getAll()) as ChapterAI[])
      if (a.id.startsWith(id + ":")) await tx.objectStore("ai").delete(a.id);
    await tx.done;
  },
};
