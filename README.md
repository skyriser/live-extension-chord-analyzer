# Chord Analyzer

An Ableton Live Extension that extracts chord progressions from MIDI clips and displays them as copyable text — ready to paste into Claude for arrangement analysis.

## What it does

Right-click any MIDI clip → **「コード進行を解析」** → a dialog shows the chord progression per bar, with note names and chord symbols. Hit "クリップボードにコピー" and paste it wherever you need it.

**Example output:**
```
Track: Atmosphere Pad
BPM: 138
Clip: 1-Chord Loop

Bar 1:     Bm       (B D F#)
Bar 5:     G        (G B D)
Bar 9:     D        (D F# A)
Bar 13:    A        (A C# E)
```

## Requirements

- Ableton Live 12.4.5 Suite Beta (or later with Extensions support)
- Node.js ≥ 24 (managed via fnm)

## Development

### Setup

```powershell
npm install
```

### Run (development mode)

1. Open Live and enable **Preferences → Extensions → Developer Mode**
2. In PowerShell:

```powershell
$fnmEnv = & fnm env --shell powershell; Invoke-Expression ($fnmEnv -join "`n")
npm start
```

Live will show the context menu action on any MIDI clip. Restart `npm start` after code changes.

### Build

```powershell
npm run build:dev   # development build (with sourcemaps)
npm run build       # production build
```

### Package for installation

```powershell
npm run package     # produces chord-analyzer.ablx
```

Drop the `.ablx` file into **Preferences → Extensions** in Live to install it permanently (no `npm start` needed).

## Chord detection

Notes are grouped by bar (4 beats, 4/4 assumed). Supported chord types:

| Suffix | Type |
|--------|------|
| *(none)* | Major |
| `m` | Minor |
| `5` | Power chord |
| `dim` | Diminished |
| `aug` | Augmented |
| `sus2` / `sus4` | Suspended |
| `maj7` | Major 7th |
| `7` | Dominant 7th |
| `m7` | Minor 7th |
| `mM7` | Minor Major 7th |
| `dim7` | Diminished 7th |
| `m7b5` | Half-diminished |
| `6` / `m6` | 6th |
| `add9` | Add 9 |

If no pattern matches, the pitch class names are shown as-is (e.g. `C/E/G/Bb`).

## Project structure

```
src/
  extension.ts    — main extension logic
  interface.html  — modal dialog UI
  html.d.ts       — TypeScript declaration for HTML imports
manifest.json     — extension metadata
build.ts          — esbuild build script
.env              — EXTENSION_HOST_PATH (not committed)
```
