import type { DrumVoice } from "./audio";

export type PieceKind = "kick" | "drum" | "cymbal";

export type DrumPiece = {
  id: string;
  label: string;
  kind: PieceKind;
  /** normalized centre in canvas space (already mirrored / display coords) */
  cx: number;
  cy: number;
  /** normalized radii */
  rx: number;
  ry: number;
  voice: DrumVoice;
  /** cymbal tilt in radians */
  tilt?: number;
};

/**
 * Expansive heavy-metal configuration:
 * double kicks, 4 rack toms, 2 floor toms, snare, hi-hat,
 * 3 crashes, ride and a splash on extended racks.
 */
export const DRUM_KIT: DrumPiece[] = [
  // double bass drums (front, low)
  {
    id: "kick-l",
    label: "Kick L",
    kind: "kick",
    cx: 0.36,
    cy: 0.78,
    rx: 0.115,
    ry: 0.15,
    voice: { kind: "kick", note: "B0" },
  },
  {
    id: "kick-r",
    label: "Kick R",
    kind: "kick",
    cx: 0.64,
    cy: 0.78,
    rx: 0.115,
    ry: 0.15,
    voice: { kind: "kick", note: "A0" },
  },

  // snare
  {
    id: "snare",
    label: "Snare",
    kind: "drum",
    cx: 0.5,
    cy: 0.63,
    rx: 0.075,
    ry: 0.05,
    voice: { kind: "snare" },
  },

  // rack toms (arc above the kicks)
  {
    id: "tom-1",
    label: "Tom I",
    kind: "drum",
    cx: 0.35,
    cy: 0.5,
    rx: 0.06,
    ry: 0.04,
    voice: { kind: "tom", note: "G3" },
  },
  {
    id: "tom-2",
    label: "Tom II",
    kind: "drum",
    cx: 0.45,
    cy: 0.455,
    rx: 0.062,
    ry: 0.042,
    voice: { kind: "tom", note: "E3" },
  },
  {
    id: "tom-3",
    label: "Tom III",
    kind: "drum",
    cx: 0.55,
    cy: 0.455,
    rx: 0.064,
    ry: 0.044,
    voice: { kind: "tom", note: "C3" },
  },
  {
    id: "tom-4",
    label: "Tom IV",
    kind: "drum",
    cx: 0.65,
    cy: 0.5,
    rx: 0.066,
    ry: 0.046,
    voice: { kind: "tom", note: "A2" },
  },

  // floor toms
  {
    id: "floor-1",
    label: "Floor I",
    kind: "drum",
    cx: 0.79,
    cy: 0.68,
    rx: 0.08,
    ry: 0.055,
    voice: { kind: "tom", note: "F2" },
  },
  {
    id: "floor-2",
    label: "Floor II",
    kind: "drum",
    cx: 0.2,
    cy: 0.7,
    rx: 0.085,
    ry: 0.058,
    voice: { kind: "tom", note: "D2" },
  },

  // hi-hat
  {
    id: "hihat",
    label: "Hi-Hat",
    kind: "cymbal",
    cx: 0.24,
    cy: 0.5,
    rx: 0.065,
    ry: 0.018,
    tilt: -0.12,
    voice: { kind: "hat" },
  },

  // crashes / ride / splash
  {
    id: "crash-1",
    label: "Crash I",
    kind: "cymbal",
    cx: 0.3,
    cy: 0.29,
    rx: 0.085,
    ry: 0.022,
    tilt: -0.18,
    voice: { kind: "cymbal", freq: 300, decay: 1.8 },
  },
  {
    id: "splash",
    label: "Splash",
    kind: "cymbal",
    cx: 0.5,
    cy: 0.24,
    rx: 0.05,
    ry: 0.014,
    tilt: 0.05,
    voice: { kind: "cymbal", freq: 620, decay: 0.7 },
  },
  {
    id: "crash-2",
    label: "Crash II",
    kind: "cymbal",
    cx: 0.68,
    cy: 0.28,
    rx: 0.09,
    ry: 0.023,
    tilt: 0.16,
    voice: { kind: "cymbal", freq: 260, decay: 2.1 },
  },
  {
    id: "crash-3",
    label: "Crash III",
    kind: "cymbal",
    cx: 0.13,
    cy: 0.36,
    rx: 0.072,
    ry: 0.02,
    tilt: -0.24,
    voice: { kind: "cymbal", freq: 340, decay: 1.5 },
  },
  {
    id: "ride",
    label: "Ride",
    kind: "cymbal",
    cx: 0.86,
    cy: 0.4,
    rx: 0.1,
    ry: 0.026,
    tilt: 0.2,
    voice: { kind: "cymbal", freq: 190, decay: 2.6 },
  },
];

export function pieceAt(x: number, y: number): DrumPiece | null {
  let best: DrumPiece | null = null;
  let bestD = Infinity;
  for (const p of DRUM_KIT) {
    const dx = (x - p.cx) / (p.rx * 1.25);
    const dy = (y - p.cy) / (Math.max(p.ry, 0.045) * 1.6);
    const d = dx * dx + dy * dy;
    if (d < 1 && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
