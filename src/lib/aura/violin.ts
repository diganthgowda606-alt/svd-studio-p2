/** Aura Violin note map: finger count picks the degree, tilt/pinch shift the register. */

export const VIOLIN_DEGREES = ["G3", "A3", "B3", "D4", "E4"] as const;
export const VIOLIN_DEGREE_LABELS = ["G", "A", "B", "D", "E"] as const;

export type ViolinRegister = "low" | "high";

/** tilt beyond the threshold lifts the phrase an octave (upper register) */
export function registerFromTilt(tiltDeg: number, threshold = 18): ViolinRegister {
  return tiltDeg > threshold ? "high" : "low";
}

export function violinNote(fingers: number, register: ViolinRegister): string {
  const base = VIOLIN_DEGREES[Math.min(VIOLIN_DEGREES.length, Math.max(1, fingers)) - 1] ?? "A3";
  if (register === "low") return base;
  const name = base.slice(0, -1);
  const octave = Number(base.slice(-1)) + 1;
  return `${name}${octave}`;
}

export function violinLabel(fingers: number, register: ViolinRegister): string {
  const note = violinNote(fingers, register);
  return `${note}${register === "high" ? " ↑" : ""}`;
}
