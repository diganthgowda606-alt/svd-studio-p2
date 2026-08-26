import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Slider } from "@/components/ui/slider";
import {
  GUITAR_STRINGS,
  PIANO_NOTES,
  isAudioStarted,
  pluckGuitar,
  playPiano,
  playDrum,
  playChord,
  stopChord,
  setToneColor,
  setMasterVolume,
  startAudio,
  transpose,
  getWaveform,
  type InstrumentKind,
} from "@/lib/aura/audio";
import { DRUM_KIT, pieceAt, type DrumPiece } from "@/lib/aura/drumKit";
import {
  CHORD_DEGREE_LABELS,
  CHORD_ROOTS,
  chordLabel,
  chordNotes,
  countFingers,
  handTilt,
  qualityFromTilt,
  type ChordQuality,
} from "@/lib/aura/chords";
import { buildHands, createHandLandmarker, type Hand } from "@/lib/aura/handTracking";
import {
  DEFAULT_CALIBRATION,
  computeCalibration,
  emptySamples,
  loadCalibration,
  saveCalibration,
  type Calibration,
  type CalibrationSamples,
} from "@/lib/aura/calibration";

type Ripple = { x: number; y: number; r: number; max: number; tone: "sienna" | "charcoal" | "cream" };

const CREAM = "rgba(243, 236, 224, ";
const CHARCOAL = "rgba(60, 53, 45, ";
const SIENNA = "rgba(122, 60, 35, ";
const COPPER = "rgba(154, 84, 48, ";
const BRASS = "rgba(226, 214, 190, ";

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_NAMES = ["Thumb", "Index", "Middle", "Ring", "Pinky"];

type CalPhase = "none" | "rest" | "press" | "done";
const REST_MS = 2600;
const PRESS_MS = 4200;

const CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

type HandMotion = { y: number; vy: number; lastStrike: number };
type TipMotion = { y: number; vy: number };

/** live calibration diagnostics shown in the on-screen overlay */
type CalDiag = {
  tipY: number | null;
  deepestY: number | null;
  restY: number;
  jitter: number;
  peakVel: number;
  pressY: number;
  releaseY: number;
  samples: number;
};


/** gesture timing constants (ms) — debounce windows keep triggers from chattering */
const FINGER_REFRACTORY = 110; // same finger can't retrigger faster than this
const KEY_REFRACTORY = 70; // same note can't retrigger faster than this
const STRING_REFRACTORY = 190;
const PIECE_REFRACTORY = 95; // same drum/cymbal
const HAND_REFRACTORY = 105; // same hand
/** velocity smoothing factor per 16.7ms frame (higher = snappier, noisier) */
const VEL_SMOOTH = 0.45;

/** frame-rate independent exponential blend */
const blend = (a: number, dt: number) => 1 - Math.pow(1 - a, Math.min(3, dt / 16.667));


export default function PerformanceStage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [instrument, setInstrument] = useState<InstrumentKind>("piano");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("idle");
  const [volume, setVolume] = useState(0.7);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [activeKeys, setActiveKeys] = useState<number[]>([]);
  const [stringPulse, setStringPulse] = useState<Record<number, number>>({});
  const [handsSeen, setHandsSeen] = useState(0);
  const [fingersTracked, setFingersTracked] = useState(0);
  const [lastHit, setLastHit] = useState<string | null>(null);
  const [calPhase, setCalPhase] = useState<CalPhase>("none");
  const [calProgress, setCalProgress] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const [flowIn, setFlowIn] = useState(false);
  const [calDiag, setCalDiag] = useState<CalDiag | null>(null);

  const calRef = useRef<Calibration>(DEFAULT_CALIBRATION);
  const calPhaseRef = useRef<CalPhase>("none");
  const calStartRef = useRef(0);
  const calSamplesRef = useRef<CalibrationSamples>(emptySamples());
  const calPrevYRef = useRef<number | null>(null);
  const calDiagRef = useRef<CalDiag | null>(null);
  const calDiagPushRef = useRef(0);
  const smoothRef = useRef<Record<number, { x: number; y: number; z: number }[]>>({});


  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;

  const ripplesRef = useRef<Ripple[]>([]);
  const handsRef = useRef<Hand[]>([]);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof createHandLandmarker>> | null>(null);
  const stringLatchRef = useRef<Record<number, number>>({});
  const fretRef = useRef(0);
  const stringVibrationRef = useRef<Record<number, number>>({});

  // piano: per-hand, per-finger latch state
  const fingerLatchRef = useRef<Record<string, boolean>>({});
  const activeKeysRef = useRef<Set<number>>(new Set());
  const pressedTipsRef = useRef<{ x: number; y: number }[]>([]);
  const tipMotionRef = useRef<Record<string, TipMotion>>({});
  const fingerLastTrigRef = useRef<Record<string, number>>({});
  const keyLastTrigRef = useRef<Record<number, number>>({});

  // guitar strum velocity
  const strumMotionRef = useRef<{ x: number; y: number; v: number } | null>(null);

  // drums
  const handMotionRef = useRef<Record<number, HandMotion>>({});
  const pieceLastHitRef = useRef<Record<string, number>>({});
  const pieceGlowRef = useRef<Record<string, number>>({});
  const kickGlowRef = useRef(0);
  const lastKickRef = useRef(0);
  const lastFrameRef = useRef(0);


  useEffect(() => {
    setMasterVolume(volume);
  }, [volume]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setFlowIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const addRipple = useCallback((x: number, y: number, tone: Ripple["tone"], max = 220) => {
    ripplesRef.current.push({ x, y, r: 4, max, tone });
    if (ripplesRef.current.length > 60) ripplesRef.current.shift();
  }, []);

  const triggerPiano = useCallback(
    (noteIndex: number, x: number, y: number, velocity: number) => {
      const note = PIANO_NOTES[noteIndex] ?? "C4";
      playPiano(note, velocity);
      setActiveNote(note);
      activeKeysRef.current.add(noteIndex);
      setActiveKeys([...activeKeysRef.current]);
      addRipple(x, y, "sienna", 160 + Math.random() * 120);
    },
    [addRipple],
  );

  const releasePiano = useCallback((noteIndex: number) => {
    activeKeysRef.current.delete(noteIndex);
    setActiveKeys([...activeKeysRef.current]);
  }, []);

  const triggerString = useCallback(
    (stringIndex: number, x: number, y: number, velocity: number) => {
      const base = GUITAR_STRINGS[stringIndex] ?? "E3";
      const note = transpose(base, fretRef.current);
      pluckGuitar(note, velocity);
      setActiveNote(note);
      stringVibrationRef.current[stringIndex] = 1;
      setStringPulse((p) => ({ ...p, [stringIndex]: (p[stringIndex] ?? 0) + 1 }));
      addRipple(x, y, stringIndex % 2 === 0 ? "charcoal" : "sienna");
    },
    [addRipple],
  );

  const strikePiece = useCallback(
    (piece: DrumPiece, velocity: number, w: number, h: number) => {
      playDrum(piece.voice, Math.min(1, Math.max(0.25, velocity)));
      pieceGlowRef.current[piece.id] = 1;
      setLastHit(piece.label);
      setActiveNote(piece.label);
      addRipple(
        piece.cx * w,
        piece.cy * h,
        piece.kind === "cymbal" ? "cream" : "sienna",
        piece.kind === "cymbal" ? 300 : 200,
      );
    },
    [addRipple],
  );

  /* ---------------- gesture analysis ---------------- */

  const analysePiano = useCallback(
    (hands: Hand[], w: number, h: number, dt: number) => {
      const now = performance.now();
      const k = blend(VEL_SMOOTH, dt);
      const pressed: { x: number; y: number }[] = [];
      const stillDown = new Set<number>();
      const seen = new Set<string>();
      // chord bucket: notes crossing the plane in this frame fire together
      const chord = new Map<number, { x: number; y: number; velocity: number }>();
      let tips = 0;

      hands.forEach((hand, hi) => {
        FINGER_TIPS.forEach((lmIndex, fi) => {
          const tip = hand.landmarks[lmIndex];
          if (!tip) return;
          tips += 1;
          const dx = 1 - tip.x; // display space (mirrored)
          const key = `${hi}-${fi}`;
          seen.add(key);
          const idx = Math.min(
            PIANO_NOTES.length - 1,
            Math.max(0, Math.floor(((dx - 0.04) / 0.92) * PIANO_NOTES.length)),
          );

          // smoothed downward velocity (units/frame-equivalent), drives dynamics
          const prev = tipMotionRef.current[key];
          const rawV = prev ? ((tip.y - prev.y) * 16.667) / Math.max(1, dt) : 0;
          const vy = prev ? prev.vy + (rawV - prev.vy) * k : 0;
          tipMotionRef.current[key] = { y: tip.y, vy };

          const latched = fingerLatchRef.current[key] ?? false;
          const lastFinger = fingerLastTrigRef.current[key] ?? 0;
          const lastKey = keyLastTrigRef.current[idx] ?? 0;

          if (!latched && tip.y > calRef.current.pressY) {
            fingerLatchRef.current[key] = true;
            if (now - lastFinger > FINGER_REFRACTORY && now - lastKey > KEY_REFRACTORY) {
              fingerLastTrigRef.current[key] = now;
              keyLastTrigRef.current[idx] = now;
              const depth = Math.min(1, (tip.y - calRef.current.pressY) / 0.2);
              const speed = Math.min(1, Math.max(0, vy) * 22);
              const velocity = Math.min(1, 0.38 + depth * 0.3 + speed * 0.34);
              const existing = chord.get(idx);
              if (!existing || velocity > existing.velocity) {
                chord.set(idx, { x: dx * w, y: tip.y * h, velocity });
              }
            }
          } else if (latched && tip.y < calRef.current.releaseY) {
            fingerLatchRef.current[key] = false;
            releasePiano(idx);
          }
          if (fingerLatchRef.current[key]) {
            stillDown.add(idx);
            pressed.push({ x: dx, y: tip.y });
          }
        });
      });

      // fire the whole chord in one pass so audio + ripples land on the same frame
      for (const [idx, n] of chord) triggerPiano(idx, n.x, n.y, n.velocity);

      // drop motion state for fingers that left the frame (prevents ghost velocity spikes)
      for (const key of Object.keys(tipMotionRef.current)) {
        if (!seen.has(key)) {
          delete tipMotionRef.current[key];
          delete fingerLatchRef.current[key];
        }
      }

      setFingersTracked(tips);
      pressedTipsRef.current = pressed;

      // clean up keys whose finger left the frame
      let changed = false;
      for (const kk of [...activeKeysRef.current]) {
        if (!stillDown.has(kk)) {
          activeKeysRef.current.delete(kk);
          changed = true;
        }
      }
      if (changed) setActiveKeys([...activeKeysRef.current]);
    },
    [releasePiano, triggerPiano],
  );

  const analyseGuitar = useCallback(
    (hands: Hand[], w: number, h: number, dt: number) => {
      const sorted = [...hands].sort((a, b) => a.palm.x - b.palm.x);
      const fretHand = sorted.length > 1 ? sorted[0] : undefined;
      const strumHand = sorted.length > 1 ? sorted[1] : sorted[0];
      if (fretHand) {
        const pinched = fretHand.pinch < calRef.current.pinchThreshold;
        fretRef.current = pinched
          ? Math.round((1 - Math.min(Math.max(fretHand.palm.y, 0.1), 0.9)) * 7)
          : 0;
      } else {
        fretRef.current = 0;
      }
      if (!strumHand) {
        strumMotionRef.current = null;
        return;
      }
      const tip = strumHand.landmarks[8] ?? strumHand.palm;
      const y = tip.y;
      const x = 1 - tip.x;
      const now = performance.now();

      // smoothed strum speed -> pluck dynamics instead of a random value
      const prevS = strumMotionRef.current;
      const kk = blend(VEL_SMOOTH, dt);
      const rawSpeed = prevS
        ? (Math.hypot(x - prevS.x, y - prevS.y) * 16.667) / Math.max(1, dt)
        : 0;
      const speed = prevS ? prevS.v + (rawSpeed - prevS.v) * kk : 0;
      strumMotionRef.current = { x, y, v: speed };

      GUITAR_STRINGS.forEach((_, i) => {
        const lineY = 0.24 + (i * 0.52) / (GUITAR_STRINGS.length - 1);
        if (Math.abs(y - lineY) < 0.028) {
          const last = stringLatchRef.current[i] ?? 0;
          if (now - last > STRING_REFRACTORY) {
            stringLatchRef.current[i] = now;
            triggerString(i, x * w, lineY * h, Math.min(1, 0.45 + speed * 18));
          }
        }
      });
    },
    [triggerString],
  );

  const analyseDrums = useCallback(
    (hands: Hand[], w: number, h: number, dt: number) => {
      const now = performance.now();
      const k = blend(VEL_SMOOTH, dt);
      const strikes: { x: number; y: number; velocity: number; hand: number }[] = [];

      hands.forEach((hand, hi) => {
        // mean of the whole landmark cluster = stable hand vector
        let sy = 0;
        let sx = 0;
        for (const p of hand.landmarks) {
          sy += p.y;
          sx += 1 - p.x;
        }
        const y = sy / Math.max(1, hand.landmarks.length);
        const x = sx / Math.max(1, hand.landmarks.length);

        const prev = handMotionRef.current[hi] ?? { y, vy: 0, lastStrike: 0 };
        const rawVy = ((y - prev.y) * 16.667) / Math.max(1, dt);
        const vy = prev.vy + (rawVy - prev.vy) * k;
        // accelerating downward then reversing = strike
        const reversed = prev.vy > calRef.current.strikeVel && vy < prev.vy * 0.45;
        if (reversed && now - prev.lastStrike > HAND_REFRACTORY) {
          strikes.push({ x, y, velocity: Math.min(1, 0.35 + prev.vy * 16), hand: hi });
          handMotionRef.current[hi] = { y, vy: 0, lastStrike: now };
        } else {
          handMotionRef.current[hi] = { y, vy, lastStrike: prev.lastStrike };
        }
      });

      // both hands pumping together -> double kick
      if (strikes.length === 2 && now - lastKickRef.current > 200) {
        const avgLow = (strikes[0]!.y + strikes[1]!.y) / 2;
        if (avgLow > 0.55) {
          lastKickRef.current = now;
          kickGlowRef.current = 1;
          const kicks = DRUM_KIT.filter((p) => p.kind === "kick");
          kicks.forEach((kp, i) =>
            window.setTimeout(() => strikePiece(kp, 0.95, w, h), i * 45),
          );
          return;
        }
      }

      for (const s of strikes) {
        const piece = pieceAt(s.x, s.y);
        if (!piece) continue;
        const lastHit = pieceLastHitRef.current[piece.id] ?? 0;
        if (now - lastHit < PIECE_REFRACTORY) continue;
        pieceLastHitRef.current[piece.id] = now;
        strikePiece(piece, s.velocity, w, h);
      }
    },
    [strikePiece],
  );


  const analyse = useCallback(
    (hands: Hand[], w: number, h: number, dt: number) => {
      if (instrumentRef.current === "piano") analysePiano(hands, w, h, dt);
      else if (instrumentRef.current === "guitar") analyseGuitar(hands, w, h, dt);
      else analyseDrums(hands, w, h, dt);
    },
    [analyseDrums, analyseGuitar, analysePiano],
  );


  /* ---------------- rendering ---------------- */

  const drawKit = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // rack scaffolding
    ctx.strokeStyle = CHARCOAL + "0.85)";
    ctx.lineWidth = Math.max(2, w * 0.0035);
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.94);
    ctx.lineTo(w * 0.08, h * 0.34);
    ctx.lineTo(w * 0.92, h * 0.3);
    ctx.lineTo(w * 0.92, h * 0.94);
    ctx.stroke();

    for (const piece of DRUM_KIT) {
      const cx = piece.cx * w;
      const cy = piece.cy * h;
      const rx = piece.rx * w;
      const ry = piece.ry * h;
      const glow = pieceGlowRef.current[piece.id] ?? 0;
      pieceGlowRef.current[piece.id] = glow * 0.9;

      // stand
      if (piece.kind !== "kick") {
        ctx.strokeStyle = CHARCOAL + "0.75)";
        ctx.lineWidth = Math.max(1.5, w * 0.002);
        ctx.beginPath();
        ctx.moveTo(cx, cy + ry);
        ctx.lineTo(cx + (cx > w / 2 ? 8 : -8), h * 0.95);
        ctx.stroke();
      }

      if (piece.kind === "cymbal") {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(piece.tilt ?? 0);
        ctx.fillStyle = BRASS + (0.28 + glow * 0.55).toFixed(3) + ")";
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CREAM + (0.55 + glow * 0.4).toFixed(3) + ")";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // lathe grooves
        for (let i = 1; i <= 3; i++) {
          ctx.strokeStyle = CHARCOAL + (0.22 + glow * 0.2).toFixed(3) + ")";
          ctx.beginPath();
          ctx.ellipse(0, 0, (rx * i) / 4, (ry * i) / 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        const depth = piece.kind === "kick" ? ry * 0.55 : ry * 1.6;
        // shell body
        ctx.fillStyle = COPPER + (0.5 + glow * 0.4).toFixed(3) + ")";
        ctx.beginPath();
        ctx.ellipse(cx, cy + depth, rx, ry, 0, 0, Math.PI);
        ctx.rect(cx - rx, cy, rx * 2, depth);
        ctx.fill();
        // head
        ctx.fillStyle = SIENNA + (0.55 + glow * 0.45).toFixed(3) + ")";
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CREAM + (0.4 + glow * 0.5).toFixed(3) + ")";
        ctx.lineWidth = piece.kind === "kick" ? 3 : 2;
        ctx.stroke();
        // lugs
        const lugs = piece.kind === "kick" ? 10 : 8;
        for (let i = 0; i < lugs; i++) {
          const a = (i / lugs) * Math.PI * 2;
          ctx.fillStyle = CHARCOAL + "0.9)";
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * rx * 0.94, cy + Math.sin(a) * ry * 0.94, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (piece.kind === "kick") {
          const k = kickGlowRef.current;
          kickGlowRef.current = k * 0.88;
          ctx.strokeStyle = CREAM + (0.15 + k * 0.6).toFixed(3) + ")";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.fillStyle = CREAM + (0.35 + glow * 0.5).toFixed(3) + ")";
      ctx.font = `${Math.max(9, w * 0.0095)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(piece.label.toUpperCase(), cx, cy - ry - 7);
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (instrumentRef.current === "piano") {
      // key plane
      const planeY = calRef.current.pressY * h;
      ctx.strokeStyle = CREAM + "0.4)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.04, planeY);
      ctx.lineTo(w * 0.96, planeY);
      ctx.stroke();
      ctx.setLineDash([]);

      const count = PIANO_NOTES.length;
      for (let i = 0; i < count; i++) {
        const x0 = w * 0.04 + (i / count) * w * 0.92;
        const x1 = w * 0.04 + ((i + 1) / count) * w * 0.92;
        const on = activeKeysRef.current.has(i);
        ctx.fillStyle = on ? SIENNA + "0.6)" : CREAM + "0.07)";
        ctx.fillRect(x0 + 1, planeY, x1 - x0 - 2, h - planeY);
        ctx.strokeStyle = CREAM + (on ? "0.7)" : "0.18)");
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 1, planeY, x1 - x0 - 2, h - planeY);
      }
    } else if (instrumentRef.current === "guitar") {
      GUITAR_STRINGS.forEach((_, i) => {
        const y = (0.24 + (i * 0.52) / (GUITAR_STRINGS.length - 1)) * h;
        const vib = stringVibrationRef.current[i] ?? 0;
        stringVibrationRef.current[i] = vib * 0.9;
        ctx.strokeStyle = CREAM + (0.22 + vib * 0.55).toFixed(3) + ")";
        ctx.lineWidth = 1 + vib * 2;
        ctx.beginPath();
        for (let x = w * 0.05; x <= w * 0.95; x += 6) {
          const t = (x - w * 0.05) / (w * 0.9);
          const wave = Math.sin(t * Math.PI) * Math.sin(performance.now() / 22 + i) * 14 * vib;
          if (x === w * 0.05) ctx.moveTo(x, y + wave);
          else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      });
    } else {
      drawKit(ctx, w, h);
    }

    // waveform band
    const wave = getWaveform();
    if (wave && wave.length) {
      ctx.strokeStyle = SIENNA + "0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const x = (i / wave.length) * w;
        const y = h * 0.5 + (wave[i] ?? 0) * h * 0.42;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ripples
    ripplesRef.current = ripplesRef.current.filter((r) => r.r < r.max);
    for (const r of ripplesRef.current) {
      r.r += (r.max - r.r) * 0.045 + 1.2;
      const alpha = Math.max(0, 1 - r.r / r.max) * 0.55;
      const tone = r.tone === "sienna" ? SIENNA : r.tone === "cream" ? BRASS : CHARCOAL;
      ctx.strokeStyle = tone + alpha.toFixed(3) + ")";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = CREAM + (alpha * 0.5).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }

    // full skeleton rig
    for (const hand of handsRef.current) {
      const pts = hand.landmarks.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
      ctx.strokeStyle = CREAM + "0.72)";
      ctx.lineWidth = 1.6;
      for (const [a, b] of CONNECTIONS) {
        const pa = pts[a];
        const pb = pts[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      pts.forEach((p, i) => {
        const isTip = FINGER_TIPS.includes(i);
        ctx.fillStyle = isTip ? SIENNA + "0.95)" : CHARCOAL + "0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, isTip ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (isTip) {
          ctx.strokeStyle = CREAM + "0.8)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      });
    }

    // pressed fingertip halos (piano)
    if (instrumentRef.current === "piano") {
      for (const p of pressedTipsRef.current) {
        ctx.strokeStyle = SIENNA + "0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- calibration diagnostics: press plane + hysteresis gap ----
    const calPhase = calPhaseRef.current;
    const diag = calDiagRef.current;
    if ((calPhase === "rest" || calPhase === "press") && diag) {
      const pressPx = diag.pressY * h;
      const releasePx = diag.releaseY * h;
      const x0 = w * 0.06;
      const x1 = w * 0.94;

      // hysteresis band
      ctx.fillStyle = SIENNA + "0.16)";
      ctx.fillRect(x0, releasePx, x1 - x0, Math.max(1, pressPx - releasePx));

      // release plane (dashed cream)
      ctx.setLineDash([4, 7]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = CREAM + "0.55)";
      ctx.beginPath();
      ctx.moveTo(x0, releasePx);
      ctx.lineTo(x1, releasePx);
      ctx.stroke();
      ctx.setLineDash([]);

      // press plane (solid sienna)
      ctx.strokeStyle = SIENNA + "0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, pressPx);
      ctx.lineTo(x1, pressPx);
      ctx.stroke();

      ctx.font = `${Math.max(9, w * 0.0095)}px system-ui`;
      ctx.textAlign = "left";
      ctx.fillStyle = CREAM + "0.8)";
      ctx.fillText("RELEASE", x0 + 4, releasePx - 5);
      ctx.fillStyle = SIENNA + "1)";
      ctx.fillText("PRESS PLANE", x0 + 4, pressPx + 13);
      ctx.textAlign = "right";
      ctx.fillStyle = CREAM + "0.7)";
      ctx.fillText(
        `GAP ${(diag.pressY - diag.releaseY).toFixed(3)}`,
        x1 - 4,
        (pressPx + releasePx) / 2 + 3,
      );

      // live fingertip depth marker
      if (diag.deepestY !== null) {
        const y = diag.deepestY * h;
        const below = diag.deepestY > diag.pressY;
        ctx.strokeStyle = below ? SIENNA + "0.9)" : CREAM + "0.45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (diag.restY > 0) {
        const y = diag.restY * h;
        ctx.strokeStyle = CHARCOAL + "0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = CREAM + "0.55)";
        ctx.fillText("REST", x0 + 4, y - 4);
      }
    }
  }, [drawKit]);


  /** exponential smoothing of landmarks — removes tracker jitter before any trigger test */
  const smoothHands = useCallback((hands: Hand[]) => {
    const a = calRef.current.smoothing;
    hands.forEach((hand, i) => {
      const prev = smoothRef.current[i];
      if (prev && prev.length === hand.landmarks.length) {
        hand.landmarks = hand.landmarks.map((p, j) => {
          const q = prev[j]!;
          return {
            x: q.x + (p.x - q.x) * a,
            y: q.y + (p.y - q.y) * a,
            z: q.z + (p.z - q.z) * a,
          };
        });
      }
      smoothRef.current[i] = hand.landmarks.map((p) => ({ ...p }));
      const thumb = hand.landmarks[4]!;
      const index = hand.landmarks[8]!;
      const span = Math.max(Math.hypot(hand.landmarks[0]!.x - hand.landmarks[9]!.x, hand.landmarks[0]!.y - hand.landmarks[9]!.y), 0.001);
      hand.pinch = Math.hypot(thumb.x - index.x, thumb.y - index.y) / span;
      hand.pinchPoint = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2, z: 0 };
      hand.palm = hand.landmarks[9]!;
    });
    if (hands.length < Object.keys(smoothRef.current).length) {
      for (const k of Object.keys(smoothRef.current)) {
        if (Number(k) >= hands.length) delete smoothRef.current[Number(k)];
      }
    }
  }, []);

  const sampleCalibration = useCallback((hands: Hand[]) => {
    const phase = calPhaseRef.current;
    const now = performance.now();
    const elapsed = now - calStartRef.current;
    const total = phase === "rest" ? REST_MS : PRESS_MS;
    setCalProgress(Math.min(1, elapsed / total));

    if (hands.length) {
      const tips = hands.flatMap((h) => FINGER_TIPS.map((i) => h.landmarks[i]!.y));
      const meanY = tips.reduce((s, v) => s + v, 0) / tips.length;
      const maxY = Math.max(...tips);
      const prevY = calPrevYRef.current;
      const dy = prevY === null ? 0 : meanY - prevY;
      calPrevYRef.current = meanY;

      if (phase === "rest") {
        calSamplesRef.current.restY.push(meanY);
        calSamplesRef.current.restJitter.push(Math.abs(dy));
      } else if (phase === "press") {
        calSamplesRef.current.pressYs.push(maxY);
        if (dy > 0) calSamplesRef.current.peakVels.push(dy);
        for (const h of hands) calSamplesRef.current.pinches.push(h.pinch);
      }
    }

    // live diagnostics: provisional thresholds from samples gathered so far
    {
      const s = calSamplesRef.current;
      const provisional = computeCalibration(s);
      const tips = hands.length
        ? hands.flatMap((h) => FINGER_TIPS.map((i) => h.landmarks[i]!.y))
        : [];
      const diag: CalDiag = {
        tipY: tips.length ? tips.reduce((a, b) => a + b, 0) / tips.length : null,
        deepestY: tips.length ? Math.max(...tips) : null,
        restY: s.restY.length ? s.restY.reduce((a, b) => a + b, 0) / s.restY.length : 0,
        jitter: s.restJitter.length
          ? s.restJitter.reduce((a, b) => a + b, 0) / s.restJitter.length
          : 0,
        peakVel: s.peakVels.length ? Math.max(...s.peakVels) : 0,
        pressY: provisional.pressY,
        releaseY: provisional.releaseY,
        samples: s.restY.length + s.pressYs.length,
      };
      calDiagRef.current = diag;
      if (now - calDiagPushRef.current > 90) {
        calDiagPushRef.current = now;
        setCalDiag(diag);
      }
    }

    if (elapsed < total) return;


    if (phase === "rest") {
      calPhaseRef.current = "press";
      calStartRef.current = now;
      calPrevYRef.current = null;
      setCalPhase("press");
      setCalProgress(0);
      return;
    }

    const cal = computeCalibration(calSamplesRef.current);
    calRef.current = cal;
    saveCalibration(cal);
    calPhaseRef.current = "done";
    setCalPhase("done");
    setCalibrated(true);
    setStatus("live");
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const nowTs = performance.now();
    const dt = lastFrameRef.current ? Math.min(100, nowTs - lastFrameRef.current) : 16.667;
    lastFrameRef.current = nowTs;
    if (video && landmarker && video.readyState >= 2) {
      try {
        const res = landmarker.detectForVideo(video, nowTs);
        const hands = buildHands(
          (res.landmarks ?? []) as never,
          (res.handedness ?? []) as never,
        );
        smoothHands(hands);
        handsRef.current = hands;
        setHandsSeen(hands.length);
        const canvas = canvasRef.current;
        if (canvas) {
          const phase = calPhaseRef.current;
          if (phase === "rest" || phase === "press") sampleCalibration(hands);
          else analyse(hands, canvas.width, canvas.height, dt);
        }

      } catch {
        /* frame skipped */
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [analyse, draw, sampleCalibration, smoothHands]);

  const startCalibration = useCallback(() => {
    calSamplesRef.current = emptySamples();
    calPrevYRef.current = null;
    calStartRef.current = performance.now();
    calPhaseRef.current = "rest";
    setCalPhase("rest");
    setCalProgress(0);
    setCalibrated(false);
    setStatus("calibrating…");
  }, []);

  const begin = useCallback(async (recalibrate = false) => {
    setStatus("waking the room…");
    setCalProgress(0);
    try {
      await startAudio();
      setMasterVolume(volume);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 960, height: 540, facingMode: "user" },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth || 960;
        canvas.height = video.videoHeight || 540;
      }
      setStatus("listening for hands…");
      landmarkerRef.current = await createHandLandmarker();
      setRunning(true);

      const saved = loadCalibration();
      if (saved && !recalibrate) {
        calRef.current = saved;
        calPhaseRef.current = "done";
        setCalPhase("done");
        setCalibrated(true);
        setStatus("live");
      } else {
        startCalibration();
      }
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      setStatus("camera unavailable — allow webcam access and try again");
    }
  }, [loop, startCalibration, volume]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const calibrating = calPhase === "rest" || calPhase === "press";

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.985, filter: "blur(12px)" }}
      animate={
        flowIn
          ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
          : { opacity: 0, y: 28, scale: 0.985, filter: "blur(12px)" }
      }
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10"
    >
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl tracking-[0.18em] text-cream uppercase">Aura Harmony</h1>
          <p className="mt-1 text-sm tracking-widest text-cream/70 uppercase">
            performance space
          </p>
        </div>
        <div className="text-right text-xs tracking-[0.2em] text-cream/70 uppercase">
          <p>{status}</p>
          <p>
            {handsSeen} hand{handsSeen === 1 ? "" : "s"} · {fingersTracked}/10 digits
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="panel relative overflow-hidden rounded-3xl">
          <div className="relative aspect-video w-full">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-35 saturate-50"
              style={{ filter: "sepia(0.5) contrast(0.95) brightness(0.9)" }}
            />
            <div className="pointer-events-none absolute inset-0 bg-charcoal/35 mix-blend-multiply" />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

            <AnimatePresence>
              {!running && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-greige-deep/85 text-center"
                >
                  <p className="max-w-sm text-sm leading-relaxed tracking-wide text-cream/80">
                    Grant camera access, then lift both hands into the frame. All ten digits are
                    tracked. Nothing leaves your device.
                  </p>
                  <button
                    onClick={() => begin(false)}
                    className="rounded-full bg-sienna px-10 py-3 text-sm tracking-[0.3em] text-cream uppercase transition-all duration-500 hover:scale-105 hover:bg-charcoal"
                  >
                    start
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {calibrating && (
                <motion.div
                  key={calPhase}
                  initial={{ opacity: 0, filter: "blur(8px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(8px)" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-3 bg-gradient-to-b from-greige-deep/90 via-greige-deep/60 to-transparent px-8 pt-6 pb-12 text-center"
                >
                  <p className="text-[0.7rem] tracking-[0.4em] text-cream/70 uppercase">
                    calibration · step {calPhase === "rest" ? 1 : 2} of 2
                  </p>
                  <p className="max-w-sm text-sm leading-relaxed tracking-wide text-cream/85">
                    {calPhase === "rest"
                      ? "Hold both hands still and relaxed in front of the camera — we're measuring your resting position and tracker noise."
                      : "Now press down and lift a few times, as if tapping keys or striking a drum, at your natural speed."}
                  </p>
                  <div className="h-[3px] w-56 overflow-hidden rounded-full bg-cream/20">
                    <motion.div
                      className="h-full bg-sienna"
                      animate={{ width: `${Math.round(calProgress * 100)}%` }}
                      transition={{ duration: 0.2, ease: "linear" }}
                    />
                  </div>
                  <p className="text-[0.65rem] tracking-[0.3em] text-cream/55 uppercase">
                    {handsSeen ? `${handsSeen} hand${handsSeen === 1 ? "" : "s"} detected` : "show your hands"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {calibrating && calDiag && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 14 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute bottom-4 left-4 rounded-2xl border border-cream/20 bg-greige-deep/80 px-4 py-3 text-left font-mono text-[0.62rem] leading-[1.7] tracking-[0.12em] text-cream/80 backdrop-blur-[3px]"
                >
                  <p className="mb-1 tracking-[0.3em] text-cream/55 uppercase">diagnostics</p>
                  <p>
                    <span className="text-sienna">press plane</span>{" "}
                    {calDiag.pressY.toFixed(3)}
                  </p>
                  <p>release {calDiag.releaseY.toFixed(3)}</p>
                  <p>hysteresis gap {(calDiag.pressY - calDiag.releaseY).toFixed(3)}</p>
                  <p>rest {calDiag.restY ? calDiag.restY.toFixed(3) : "—"}</p>
                  <p>jitter {calDiag.jitter.toFixed(4)}</p>
                  <p>peak vel {calDiag.peakVel.toFixed(4)}</p>
                  <p>
                    tip depth{" "}
                    {calDiag.deepestY !== null ? calDiag.deepestY.toFixed(3) : "—"}
                    {calDiag.deepestY !== null && calDiag.deepestY > calDiag.pressY ? (
                      <span className="text-sienna"> · below</span>
                    ) : null}
                  </p>
                  <p>samples {calDiag.samples}</p>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        <aside className="panel flex flex-col gap-8 rounded-3xl p-7">
          <div>
            <p className="mb-3 text-[0.7rem] tracking-[0.3em] text-cream/70 uppercase">
              Instruments
            </p>
            <div className="flex flex-col gap-1 rounded-3xl border border-cream/25 p-1">
              {(
                [
                  ["piano", "Minimalist Grand"],
                  ["guitar", "Acoustic"],
                  ["drums", "Infernal Pulse"],
                ] as [InstrumentKind, string][]
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  onClick={() => setInstrument(kind)}
                  className={`rounded-full px-4 py-2 text-xs tracking-[0.2em] uppercase transition-all duration-500 ${
                    instrument === kind
                      ? "bg-charcoal text-cream"
                      : "text-cream/70 hover:text-cream"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[0.7rem] tracking-[0.3em] text-cream/70 uppercase">Gestures</p>
              <span className="text-[0.6rem] tracking-[0.2em] text-cream/50 uppercase">
                {calibrated ? "calibrated" : calibrating ? "measuring" : "default"}
              </span>
            </div>
            <button
              onClick={() => (running ? startCalibration() : begin(true))}
              disabled={calibrating}
              className="w-full rounded-full border border-cream/25 px-4 py-2 text-[0.65rem] tracking-[0.25em] text-cream/80 uppercase transition-all duration-500 hover:bg-charcoal hover:text-cream disabled:opacity-40"
            >
              recalibrate
            </button>
          </div>

          <div>
            <p className="mb-3 text-[0.7rem] tracking-[0.3em] text-cream/70 uppercase">Volume</p>
            <Slider
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={(v) => setVolume((v[0] ?? 70) / 100)}
            />
          </div>

          <div className="space-y-2 text-xs leading-relaxed tracking-wide text-cream/75">
            <p className="text-[0.7rem] tracking-[0.3em] text-cream/60 uppercase">Gesture</p>
            {instrument === "piano" ? (
              <p>
                Ten-finger polyphony: horizontal position picks the note, and any fingertip dipping
                below the dashed key plane sounds it. Play chords and cascading runs in mid-air.
              </p>
            ) : instrument === "guitar" ? (
              <p>
                Pinch with your left hand and move it vertically to fret. Sweep your right hand
                across the strings to strum.
              </p>
            ) : (
              <p>
                Hover a hand over a drum or cymbal and make a sharp downward strike. Pump both
                hands down together low in the frame to fire the double kicks.
              </p>
            )}
          </div>

          <div className="mt-auto">
            <p className="text-[0.7rem] tracking-[0.3em] text-cream/60 uppercase">Now sounding</p>
            <p className="font-display text-4xl text-cream">
              {instrument === "drums" ? (lastHit ?? "—") : (activeNote ?? "—")}
            </p>
          </div>
        </aside>
      </div>

      <section className="mt-8">
        {instrument === "piano" ? (
          <div className="panel flex h-40 items-end gap-[3px] overflow-hidden rounded-3xl p-3">
            {PIANO_NOTES.map((note, i) => {
              const active = activeKeys.includes(i);
              const dark = note.includes("D") || note.includes("G") || note.includes("B");
              return (
                <motion.div
                  key={note}
                  animate={{
                    height: active ? "94%" : dark ? "68%" : "80%",
                    opacity: active ? 1 : 0.85,
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  className={`flex flex-1 items-end justify-center rounded-b-xl pb-2 text-[0.6rem] tracking-widest ${
                    active
                      ? "bg-sienna text-cream"
                      : dark
                        ? "bg-charcoal text-cream/60"
                        : "bg-cream text-charcoal/60"
                  }`}
                >
                  {note}
                </motion.div>
              );
            })}
          </div>
        ) : instrument === "guitar" ? (
          <div className="panel flex h-40 flex-col justify-center gap-4 rounded-3xl px-8">
            {GUITAR_STRINGS.map((s, i) => (
              <motion.div
                key={s}
                animate={{
                  scaleY: (stringPulse[i] ?? 0) % 2 === 0 ? 1 : 2.4,
                  opacity: 0.45 + ((stringPulse[i] ?? 0) % 2) * 0.5,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 12 }}
                className="h-px w-full origin-center bg-cream"
              />
            ))}
          </div>
        ) : (
          <div className="panel grid grid-cols-3 gap-2 rounded-3xl p-5 sm:grid-cols-5 lg:grid-cols-8">
            {DRUM_KIT.map((p) => (
              <motion.div
                key={p.id}
                animate={{ opacity: lastHit === p.label ? 1 : 0.7 }}
                className={`rounded-2xl border px-3 py-4 text-center text-[0.6rem] tracking-[0.18em] uppercase transition-colors duration-300 ${
                  lastHit === p.label
                    ? "border-cream/60 bg-sienna text-cream"
                    : p.kind === "cymbal"
                      ? "border-cream/30 bg-cream/10 text-cream/80"
                      : "border-cream/20 bg-charcoal/60 text-cream/70"
                }`}
              >
                {p.label}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {!isAudioStarted() && null}
    </motion.div>
  );
}
