export type SpeechTiming = { index: number; start: number; end: number };
export function playingSegment(
  timings: SpeechTiming[],
  time: number,
): number | null {
  for (let i = timings.length - 1; i >= 0; i--) {
    const segment = timings[i];
    if (segment.start <= time && time < segment.end) return segment.index;
  }
  return null;
}
