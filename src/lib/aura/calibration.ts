export type Calibration = {
  /** fingertip y below which a piano key is pressed */
  pressY: number;
  /** fingertip y above which the key releases (hysteresis) */
  releaseY: number;
  /** minimum downward velocity (normalised units / frame) counted as a drum strike */
  strikeVel: number;
  /** pinch ratio below which a pinch is considered closed */
  pinchThreshold: number;
  /** landmark smoothing factor 0..1 (higher = snappier, lower = smoother) */
  smoothing: number;
};

export const DEFAULT_CALIBRATION: Calibration = {
  pressY: 0.66,
  releaseY: 0.6,
  strikeVel: 0.014,
  pinchThreshold: 0.5,
  smoothing: 0.55,
};

const KEY = "aura-harmony:calibration:v1";

export function loadCalibration(): Calibration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Calibration>;
    return { ...DEFAULT_CALIBRATION, ...parsed };
  } catch {
    return null;
  }
}

export function saveCalibration(cal: Calibration) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cal));
  } catch {
    /* storage unavailable */
  }
}

export function clearCalibration() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type CalibrationSamples = {
  restY: number[];
  restJitter: number[];
  pressYs: number[];
  peakVels: number[];
  pinches: number[];
};

export function emptySamples(): CalibrationSamples {
  return { restY: [], restJitter: [], pressYs: [], peakVels: [], pinches: [] };
}

const mean = (a: number[], fallback: number) =>
  a.length ? a.reduce((s, v) => s + v, 0) / a.length : fallback;

const percentile = (a: number[], p: number, fallback: number) => {
  if (!a.length) return fallback;
  const s = [...a].sort((x, y) => x - y);
  return s[clamp(Math.round((s.length - 1) * p), 0, s.length - 1)]!;
};

export function computeCalibration(s: CalibrationSamples): Calibration {
  const rest = mean(s.restY, 0.45);
  const jitter = mean(s.restJitter, 0.004);
  const press = percentile(s.pressYs, 0.8, rest + 0.22);

  // put the key plane ~60% of the way from rest to the deepest press
  const pressY = clamp(rest + (press - rest) * 0.6, 0.4, 0.85);
  // hysteresis grows with measured jitter so shaky hands don't retrigger
  const gap = clamp(0.04 + jitter * 6, 0.04, 0.14);

  const peak = percentile(s.peakVels, 0.7, 0.02);
  const strikeVel = clamp(Math.max(peak * 0.45, jitter * 3.5), 0.008, 0.05);

  const minPinch = percentile(s.pinches, 0.15, 0.35);
  const pinchThreshold = clamp(minPinch + 0.12, 0.28, 0.7);

  // noisier tracking -> heavier smoothing
  const smoothing = clamp(0.7 - jitter * 25, 0.3, 0.75);

  return {
    pressY,
    releaseY: clamp(pressY - gap, 0.3, pressY - 0.02),
    strikeVel,
    pinchThreshold,
    smoothing,
  };
}
