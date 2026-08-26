import type { Hand } from "./handTracking";

export type ChordQuality = "major" | "minor";

/** one chord per raised-finger count (1–5) — a warm, singable progression */
export const CHORD_ROOTS = ["C3", "F3", "G3", "A3", "D3"];
export const CHORD_DEGREE_LABELS = ["I", "IV", "V", "vi", "ii"];

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;

function noteToMidi(note: string) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) return 60;
  const base = SEMITONES[m[1] as keyof typeof SEMITONES];
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + base + acc;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNote(midi: number) {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** triad + octave root, voiced for the pad */
export function chordNotes(root: string, quality: ChordQuality): string[] {
  const r = noteToMidi(root);
  const third = quality === "major" ? 4 : 3;
  return [r, r + third, r + 7, r + 12].map(midiToNote);
}

export function chordLabel(root: string, quality: ChordQuality) {
  return `${root.replace(/\d/, "")}${quality === "minor" ? "m" : ""}`;
}

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

/**
 * Count raised fingers. Four fingers use tip-above-pip in the hand's own frame,
 * the thumb uses lateral extension from the index knuckle.
 */
export function countFingers(hand: Hand): number {
  const lm = hand.landmarks;
  const wrist = lm[0];
  const mid = lm[9];
  if (!wrist || !mid) return 0;

  // hand "up" axis: wrist -> middle knuckle
  const ux = mid.x - wrist.x;
  const uy = mid.y - wrist.y;
  const ulen = Math.hypot(ux, uy) || 1;

  let count = 0;
  for (let i = 0; i < TIPS.length; i++) {
    const tip = lm[TIPS[i]!];
    const pip = lm[PIPS[i]!];
    if (!tip || !pip) continue;
    // projection of (tip - pip) on the up axis; positive = extended
    const proj = ((tip.x - pip.x) * ux + (tip.y - pip.y) * uy) / ulen;
    if (proj > ulen * 0.18) count += 1;
  }

  const thumb = lm[4];
  const indexMcp = lm[5];
  if (thumb && indexMcp) {
    const span = Math.hypot(wrist.x - mid.x, wrist.y - mid.y) || 1;
    if (Math.hypot(thumb.x - indexMcp.x, thumb.y - indexMcp.y) > span * 0.72) count += 1;
  }
  return Math.min(5, count);
}

/** signed tilt of the hand in degrees: 0 = upright, negative = tilted left */
export function handTilt(hand: Hand): number {
  const wrist = hand.landmarks[0];
  const mid = hand.landmarks[9];
  if (!wrist || !mid) return 0;
  // atan2 of the up-axis relative to straight up (screen y grows downward)
  return (Math.atan2(mid.x - wrist.x, wrist.y - mid.y) * 180) / Math.PI;
}

export const TILT_THRESHOLD = 18;

export function qualityFromTilt(tiltDeg: number): ChordQuality {
  return tiltDeg > TILT_THRESHOLD ? "minor" : "major";
}
