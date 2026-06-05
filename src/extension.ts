import {
  initialize,
  MidiClip,
  MidiTrack,
  type ActivationContext,
  type Handle,
  type NoteDescription,
} from "@ableton-extensions/sdk";
import interfaceHtml from "./interface.html";

// ─── Note names ───────────────────────────────────────────────────────────────

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

// ─── Chord templates ──────────────────────────────────────────────────────────

const CHORD_TEMPLATES: { intervals: number[]; suffix: string }[] = [
  // 2-note
  { intervals: [0, 7], suffix: "5" },
  // Triads
  { intervals: [0, 4, 7], suffix: "" },
  { intervals: [0, 3, 7], suffix: "m" },
  { intervals: [0, 3, 6], suffix: "dim" },
  { intervals: [0, 4, 8], suffix: "aug" },
  { intervals: [0, 2, 7], suffix: "sus2" },
  { intervals: [0, 5, 7], suffix: "sus4" },
  // 7th chords
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

interface ChordInfo {
  name: string;
  root: number;   // pitch class 0-11
  suffix: string; // e.g. "m7", "maj7", ""
}

function detectChord(pitchClasses: number[]): ChordInfo {
  const unique = [...new Set(pitchClasses)].sort((a, b) => a - b);

  if (unique.length === 0) {
    return { name: "—", root: 0, suffix: "" };
  }
  if (unique.length === 1) {
    const pc = unique[0]!;
    return { name: NOTE_NAMES[pc]!, root: pc, suffix: "" };
  }

  for (const template of CHORD_TEMPLATES) {
    if (template.intervals.length !== unique.length) continue;
    for (const root of unique) {
      const intervals = unique
        .map((p) => (p - root + 12) % 12)
        .sort((a, b) => a - b);
      if (intervals.every((v, i) => v === template.intervals[i])) {
        return { name: `${NOTE_NAMES[root]!}${template.suffix}`, root, suffix: template.suffix };
      }
    }
  }

  const root = unique[0]!;
  return { name: unique.map((p) => NOTE_NAMES[p]!).join("/"), root, suffix: "" };
}

// ─── Key detection (Krumhansl-Schmuckler) ─────────────────────────────────────

// Tonic-relative pitch class profiles derived from music perception research
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da2 = 0, db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma, db = b[i]! - mb;
    num += da * db; da2 += da * da; db2 += db * db;
  }
  return num / Math.sqrt(da2 * db2);
}

interface KeyResult {
  root: number;
  isMinor: boolean;
  label: string;
}

function detectKey(notes: NoteDescription[]): KeyResult {
  // Build pitch-class histogram weighted by note duration
  const hist = new Array(12).fill(0) as number[];
  for (const note of notes) {
    if (note.muted) continue;
    hist[note.pitch % 12]! += note.duration;
  }

  let bestRoot = 0, bestMinor = false, bestScore = -Infinity;

  for (let root = 0; root < 12; root++) {
    // Rotate histogram so this root aligns with profile index 0
    const rotated = Array.from({ length: 12 }, (_, i) => hist[(root + i) % 12]!);
    const major = pearson(rotated, KS_MAJOR);
    const minor = pearson(rotated, KS_MINOR);
    if (major > bestScore) { bestScore = major; bestRoot = root; bestMinor = false; }
    if (minor > bestScore) { bestScore = minor; bestRoot = root; bestMinor = true; }
  }

  return {
    root: bestRoot,
    isMinor: bestMinor,
    label: `${NOTE_NAMES[bestRoot]!} ${bestMinor ? "minor" : "major"}`,
  };
}

// ─── Degree name (Roman numeral) ──────────────────────────────────────────────

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function getDegree(chord: ChordInfo, key: KeyResult): string {
  const interval = (chord.root - key.root + 12) % 12;
  const scale = key.isMinor ? MINOR_SCALE : MAJOR_SCALE;

  let prefix = "";
  let base: number;

  const exactIdx = scale.indexOf(interval);
  if (exactIdx >= 0) {
    base = exactIdx;
  } else {
    const flatIdx = scale.indexOf((interval + 1) % 12);
    const sharpIdx = scale.indexOf((interval - 1 + 12) % 12);
    if (flatIdx >= 0) { prefix = "b"; base = flatIdx; }
    else if (sharpIdx >= 0) { prefix = "#"; base = sharpIdx; }
    else return "?";
  }

  const roman = ROMAN[base]!;
  const sfx = chord.suffix;
  const isMinorQuality = sfx.startsWith("m") && !sfx.startsWith("maj");
  const isDim = sfx.startsWith("dim");
  const cased = (isMinorQuality || isDim) ? roman.toLowerCase() : roman;

  // Quality annotation on the degree
  const q: Record<string, string> = {
    "dim": "°", "dim7": "°7", "m7b5": "ø7", "aug": "+",
    "7": "7", "maj7": "M7", "m7": "7", "mM7": "M7",
    "sus2": "sus2", "sus4": "sus4", "add9": "add9",
    "6": "6", "m6": "6", "5": "5",
  };

  return `${prefix}${cased}${q[sfx] ?? ""}`;
}

// ─── Extension entry ──────────────────────────────────────────────────────────

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

        // Detect key from all non-muted notes (use full note set for better statistics)
        const key = detectKey(notes);

        // Group by bar — skip notes shorter than half a bar (< 2 beats)
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
          `Key: ${key.label} (estimated)`,
          "",
        ];

        const sortedBars = [...barMap.keys()].sort((a, b) => a - b);

        if (sortedBars.length === 0) {
          lines.push("(ノートが見つかりませんでした)");
        } else {
          for (const bar of sortedBars) {
            const pitchClasses = [...barMap.get(bar)!].sort((a, b) => a - b);
            const noteNames = pitchClasses.map((p) => NOTE_NAMES[p]!).join(" ");
            const chord = detectChord(pitchClasses);
            const degree = getDegree(chord, key);
            const label = `Bar ${bar + 1}:`.padEnd(10);
            lines.push(
              `${label} ${chord.name.padEnd(10)} (${noteNames.padEnd(12)})  ${degree}`,
            );
          }
        }

        const text = lines.join("\n");
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
