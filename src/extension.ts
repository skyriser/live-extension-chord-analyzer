import {
  initialize,
  MidiClip,
  MidiTrack,
  type ActivationContext,
  type Handle,
} from "@ableton-extensions/sdk";
import interfaceHtml from "./interface.html";

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

// Common chord templates as sorted semitone intervals from root (root = 0)
const CHORD_TEMPLATES: { intervals: number[]; suffix: string }[] = [
  // 2-note
  { intervals: [0, 7], suffix: "5" },
  // 3-note triads
  { intervals: [0, 4, 7], suffix: "" },
  { intervals: [0, 3, 7], suffix: "m" },
  { intervals: [0, 3, 6], suffix: "dim" },
  { intervals: [0, 4, 8], suffix: "aug" },
  { intervals: [0, 2, 7], suffix: "sus2" },
  { intervals: [0, 5, 7], suffix: "sus4" },
  // 4-note chords
  { intervals: [0, 4, 7, 11], suffix: "maj7" },
  { intervals: [0, 4, 7, 10], suffix: "7" },
  { intervals: [0, 3, 7, 10], suffix: "m7" },
  { intervals: [0, 3, 7, 11], suffix: "mM7" },
  { intervals: [0, 3, 6, 9], suffix: "dim7" },
  { intervals: [0, 3, 6, 10], suffix: "m7b5" },
  { intervals: [0, 4, 7, 9], suffix: "6" },
  { intervals: [0, 3, 7, 9], suffix: "m6" },
  { intervals: [0, 2, 4, 7], suffix: "add9" },
];

function detectChord(pitchClasses: number[]): string {
  const unique = [...new Set(pitchClasses)].sort((a, b) => a - b);
  if (unique.length === 0) return "—";
  if (unique.length === 1) return NOTE_NAMES[unique[0]!]!;

  for (const template of CHORD_TEMPLATES) {
    if (template.intervals.length !== unique.length) continue;
    for (const root of unique) {
      const intervals = unique
        .map((p) => (p - root + 12) % 12)
        .sort((a, b) => a - b);
      if (intervals.every((v, i) => v === template.intervals[i])) {
        return `${NOTE_NAMES[root]!}${template.suffix}`;
      }
    }
  }

  // No standard match — return slash notation of pitch classes
  return unique.map((p) => NOTE_NAMES[p]!).join("/");
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand(
    "chord-analyzer.analyze",
    (args: unknown) =>
      (async (handle: Handle) => {
        const clip = context.getObjectFromHandle(handle, MidiClip);
        const song = context.application.song;
        const bpm = song.tempo;
        const notes = clip.notes;

        const parent = clip.parent;
        const trackName =
          parent instanceof MidiTrack ? parent.name : clip.name;

        // Group by bar (4 beats = 1 bar, assuming 4/4)
        // Skip notes shorter than half a bar (< 2 beats) — likely passing tones or arpeggios
        const MIN_DURATION = 2;
        const barMap = new Map<number, Set<number>>();
        for (const note of notes) {
          if (note.muted) continue;
          if (note.duration < MIN_DURATION) continue;
          const bar = Math.floor(note.startTime / 4);
          if (!barMap.has(bar)) barMap.set(bar, new Set());
          barMap.get(bar)!.add(note.pitch % 12);
        }

        const lines: string[] = [
          `Track: ${trackName}`,
          `BPM: ${Math.round(bpm)}`,
          `Clip: ${clip.name}`,
          "",
        ];

        const sortedBars = [...barMap.keys()].sort((a, b) => a - b);

        if (sortedBars.length === 0) {
          lines.push("(ノートが見つかりませんでした)");
        } else {
          for (const bar of sortedBars) {
            const pitchClasses = [...barMap.get(bar)!].sort((a, b) => a - b);
            const noteNames = pitchClasses.map((p) => NOTE_NAMES[p]!).join(" ");
            const chordName = detectChord(pitchClasses);
            const label = `Bar ${bar + 1}:`.padEnd(10);
            lines.push(`${label} ${chordName.padEnd(8)} (${noteNames})`);
          }
        }

        const text = lines.join("\n");

        // Embed chord data safely via encodeURIComponent placeholder
        const htmlWithData = interfaceHtml.replace(
          "__ENCODED_DATA__",
          encodeURIComponent(text),
        );

        await context.ui.showModalDialog(
          `data:text/html,${encodeURIComponent(htmlWithData)}`,
          560,
          460,
        );
      })(args as Handle),
  );

  context.ui.registerContextMenuAction(
    "MidiClip",
    "コード進行を解析",
    "chord-analyzer.analyze",
  );

  console.log("Chord Analyzer: loaded");
}
