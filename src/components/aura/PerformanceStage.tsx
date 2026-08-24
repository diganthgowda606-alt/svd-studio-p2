import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Slider } from "@/components/ui/slider";
import {
  GUITAR_STRINGS,
  PIANO_NOTES,
  isAudioStarted,
  pluckGuitar,
  playPiano,
  setMasterVolume,
  startAudio,
  transpose,
  getWaveform,
  type InstrumentKind,
} from "@/lib/aura/audio";
import { buildHands, createHandLandmarker, type Hand } from "@/lib/aura/handTracking";

type Ripple = { x: number; y: number; r: number; max: number; tone: "sienna" | "charcoal" };

const CREAM = "rgba(243, 236, 224, ";
const CHARCOAL = "rgba(60, 53, 45, ";
const SIENNA = "rgba(122, 60, 35, ";

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

export default function PerformanceStage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [instrument, setInstrument] = useState<InstrumentKind>("piano");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("idle");
  const [volume, setVolume] = useState(0.7);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [activeKeyIndex, setActiveKeyIndex] = useState<number | null>(null);
  const [stringPulse, setStringPulse] = useState<Record<number, number>>({});
  const [handsSeen, setHandsSeen] = useState(0);

  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;

  const ripplesRef = useRef<Ripple[]>([]);
  const handsRef = useRef<Hand[]>([]);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof createHandLandmarker>> | null>(null);
  const lastTriggerRef = useRef(0);
  const pinchLatchRef = useRef(false);
  const stringLatchRef = useRef<Record<number, number>>({});
  const fretRef = useRef(0);
  const stringVibrationRef = useRef<Record<number, number>>({});

  useEffect(() => {
    setMasterVolume(volume);
  }, [volume]);

  const addRipple = useCallback((x: number, y: number, tone: Ripple["tone"]) => {
    ripplesRef.current.push({ x, y, r: 4, max: 180 + Math.random() * 120, tone });
    if (ripplesRef.current.length > 40) ripplesRef.current.shift();
  }, []);

  const triggerPiano = useCallback(
    (noteIndex: number, x: number, y: number, velocity: number) => {
      const now = performance.now();
      if (now - lastTriggerRef.current < 90) return;
      lastTriggerRef.current = now;
      const note = PIANO_NOTES[noteIndex] ?? "C4";
      playPiano(note, velocity);
      setActiveNote(note);
      setActiveKeyIndex(noteIndex);
      addRipple(x, y, "sienna");
      window.setTimeout(() => setActiveKeyIndex((k) => (k === noteIndex ? null : k)), 260);
    },
    [addRipple],
  );

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

  const analyse = useCallback(
    (hands: Hand[], w: number, h: number) => {
      if (instrumentRef.current === "piano") {
        const pitchHand = hands[0];
        const triggerHand = hands[1] ?? hands[0];
        if (!pitchHand || !triggerHand) {
          pinchLatchRef.current = false;
          return;
        }
        const heightNorm = 1 - Math.min(Math.max(pitchHand.palm.y, 0.05), 0.95);
        const idx = Math.min(
          PIANO_NOTES.length - 1,
          Math.floor(((heightNorm - 0.05) / 0.9) * PIANO_NOTES.length),
        );
        setActiveKeyIndex((prev) => (prev === null ? prev : prev));
        const pinched = triggerHand.pinch < 0.42;
        if (pinched && !pinchLatchRef.current) {
          pinchLatchRef.current = true;
          triggerPiano(
            Math.max(0, idx),
            (1 - triggerHand.pinchPoint.x) * w,
            triggerHand.pinchPoint.y * h,
            0.55 + (1 - triggerHand.pinch) * 0.4,
          );
        } else if (!pinched && triggerHand.pinch > 0.55) {
          pinchLatchRef.current = false;
        }
      } else {
        // fret hand = leftmost hand (pinch height sets semitone offset)
        const sorted = [...hands].sort((a, b) => a.palm.x - b.palm.x);
        const fretHand = sorted.length > 1 ? sorted[0] : undefined;
        const strumHand = sorted.length > 1 ? sorted[1] : sorted[0];
        if (fretHand) {
          const pinched = fretHand.pinch < 0.5;
          fretRef.current = pinched
            ? Math.round((1 - Math.min(Math.max(fretHand.palm.y, 0.1), 0.9)) * 7)
            : 0;
        } else {
          fretRef.current = 0;
        }
        if (!strumHand) return;
        const tip = strumHand.landmarks[8] ?? strumHand.palm;
        const y = tip.y;
        const x = 1 - tip.x;
        const now = performance.now();
        GUITAR_STRINGS.forEach((_, i) => {
          const lineY = 0.24 + (i * 0.52) / (GUITAR_STRINGS.length - 1);
          if (Math.abs(y - lineY) < 0.028) {
            const last = stringLatchRef.current[i] ?? 0;
            if (now - last > 220) {
              stringLatchRef.current[i] = now;
              triggerString(i, x * w, lineY * h, 0.6 + Math.random() * 0.3);
            }
          }
        });
      }
    },
    [triggerPiano, triggerString],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // instrument guides
    ctx.lineWidth = 1;
    if (instrumentRef.current === "piano") {
      const rows = PIANO_NOTES.length;
      for (let i = 0; i <= rows; i++) {
        const y = ((rows - i) / rows) * h;
        ctx.strokeStyle = CREAM + (i % 2 === 0 ? "0.16)" : "0.08)");
        ctx.beginPath();
        ctx.moveTo(w * 0.06, y);
        ctx.lineTo(w * 0.94, y);
        ctx.stroke();
      }
    } else {
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
      ctx.strokeStyle = (r.tone === "sienna" ? SIENNA : CHARCOAL) + alpha.toFixed(3) + ")";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = CREAM + (alpha * 0.5).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }

    // hands
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
      for (const p of pts) {
        ctx.fillStyle = CHARCOAL + "0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const pp = pts[8];
      if (pp) {
        ctx.strokeStyle = SIENNA + "0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 12 + (hand.pinch < 0.42 ? 8 : 0), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (video && landmarker && video.readyState >= 2) {
      try {
        const res = landmarker.detectForVideo(video, performance.now());
        const hands = buildHands(
          (res.landmarks ?? []) as never,
          (res.handedness ?? []) as never,
        );
        handsRef.current = hands;
        setHandsSeen(hands.length);
        const canvas = canvasRef.current;
        if (canvas) analyse(hands, canvas.width, canvas.height);
      } catch {
        /* frame skipped */
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [analyse, draw]);

  const begin = useCallback(async () => {
    setStatus("waking the room…");
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
      setStatus("live");
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      setStatus("camera unavailable — allow webcam access and try again");
    }
  }, [loop, volume]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl tracking-[0.18em] text-cream uppercase">Aura Harmony</h1>
          <p className="mt-1 text-sm tracking-widest text-cream/70 uppercase">
            performance space
          </p>
        </div>
        <div className="text-right text-xs tracking-[0.2em] text-cream/70 uppercase">
          <p>{status}</p>
          <p>{handsSeen} hand{handsSeen === 1 ? "" : "s"} in frame</p>
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
                    Grant camera access, then lift your hands into the frame. Nothing leaves your
                    device.
                  </p>
                  <button
                    onClick={begin}
                    className="rounded-full bg-sienna px-10 py-3 text-sm tracking-[0.3em] text-cream uppercase transition-all duration-500 hover:scale-105 hover:bg-charcoal"
                  >
                    start
                  </button>
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
            <div className="flex rounded-full border border-cream/25 p-1">
              {(
                [
                  ["piano", "Minimalist"],
                  ["guitar", "Acoustic"],
                ] as [InstrumentKind, string][]
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  onClick={() => setInstrument(kind)}
                  className={`flex-1 rounded-full px-4 py-2 text-xs tracking-[0.2em] uppercase transition-all duration-500 ${
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
                Raise or lower your first hand to choose the pitch. Pinch thumb and index on the
                other hand to sound the key.
              </p>
            ) : (
              <p>
                Pinch with your left hand and move it vertically to fret. Sweep your right hand
                across the strings to strum.
              </p>
            )}
          </div>

          <div className="mt-auto">
            <p className="text-[0.7rem] tracking-[0.3em] text-cream/60 uppercase">Now sounding</p>
            <p className="font-display text-4xl text-cream">{activeNote ?? "—"}</p>
          </div>
        </aside>
      </div>

      <section className="mt-8">
        {instrument === "piano" ? (
          <div className="panel flex h-40 items-end gap-[3px] overflow-hidden rounded-3xl p-3">
            {PIANO_NOTES.map((note, i) => {
              const active = activeKeyIndex === i;
              const dark = note.includes("D") || note.includes("G");
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
        ) : (
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
        )}
      </section>

      {!isAudioStarted() && null}
    </div>
  );
}
