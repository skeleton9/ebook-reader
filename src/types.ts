export interface Chapter {
  id: string;
  title: string;
  html: string;
  text: string;
}
export interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  chapters: Chapter[];
  addedAt: number;
  position: number;
  scroll: number;
  file?: ArrayBuffer;
}
export interface Note {
  id: string;
  bookId: string;
  chapterId: string;
  quote: string;
  comment: string;
  start: number;
  end: number;
  createdAt: number;
  color: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  error?: boolean;
  quote?: string;
}
export interface Summary {
  id: string;
  content: string;
  createdAt: number;
}
export interface ChapterAI {
  id: string;
  summaries: Summary[];
  messages: Message[];
}
export interface AIConfig {
  base: string;
  model: string;
  key: string;
}
export interface SpeechConfig {
  url: string;
  resource: string;
  femaleVoice: string;
  maleVoice: string;
}
