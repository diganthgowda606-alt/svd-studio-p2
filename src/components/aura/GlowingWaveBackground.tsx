import { useEffect, useRef, useState } from "react";

type Thread = {
  baseY: number;
  amp: number;
  freq: number;
  phase: number;
  speed: number;
  widthJit: number;
  alpha: number;
  bulge: number;
};

type Surge = { pos: number; x: number; y: number; life: number; strength: number };

const THREAD_COUNT = 30;
const SEGMENTS = 40;

/**
 * A dense bundle of translucent, glowing wave threads that undulate on their own,
 * warp around the pointer, and flare when you sweep or click across them.
 * Colours are pulled from the Aura Harmony design tokens.
 */
export default function GlowingWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dimsRef = useRef({ w: 0, h: 0 });
  const rectRef = useRef({ left: 0, top: 0 });
  const mouseRef = useRef({ x: -9999, y: -9999, tx: -9999, ty: -9999, active: false });
  const surgesRef = useRef<Surge[]>([]);
  const lastSurgeTimeRef = useRef(0);
  const timeRef = useRef(0);
  const threadsRef = useRef<Thread[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    const parent = canvas.parentElement;
    if (!ctx || !parent) return;

    const styles = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const GLOW = token("--sienna", "oklch(0.405 0.084 45)");
    const HIGHLIGHT = token("--cream", "oklch(0.951 0.014 85)");
    const BACKDROP = token("--charcoal", "oklch(0.315 0.012 62)");

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = reducedMotionQuery.matches;

    // Deterministic pseudo-random so thread layout is stable across resizes (no flicker).
    const rand = (() => {
      let seed = 20260825;
      return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
    })();

    const buildThreads = () => {
      const threads: Thread[] = [];
      for (let i = 0; i < THREAD_COUNT; i++) {
        const spread = (i / (THREAD_COUNT - 1)) * 2 - 1;
        threads.push({
          baseY: spread * 0.5,
          amp: 10 + rand() * 26,
          freq: 1.1 + rand() * 1.6,
          phase: rand() * Math.PI * 2,
          speed: 0.35 + rand() * 0.5,
          widthJit: rand(),
          alpha: 0.1 + rand() * 0.24,
          bulge: rand() * 0.6 + 0.4,
        });
      }
      threadsRef.current = threads;
    };
    buildThreads();

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dimsRef.current = { w, h };
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = canvas.getBoundingClientRect();
      rectRef.current = { left: r.left, top: r.top };
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    window.addEventListener("scroll", resize, { passive: true });

    const SURGE_COOLDOWN_MS = 70;
    const SURGE_SPEED_THRESHOLD = 8;

    const spawnSurge = (x: number, y: number, speed: number) => {
      const now = performance.now();
      if (now - lastSurgeTimeRef.current < SURGE_COOLDOWN_MS) return;
      lastSurgeTimeRef.current = now;
      const { w } = dimsRef.current;
      surgesRef.current.push({
        pos: Math.max(0, Math.min(1, x / w)),
        x,
        y,
        life: 1,
        strength: Math.min(1.6, 0.5 + speed * 0.02),
      });
      if (surgesRef.current.length > 12) surgesRef.current.shift();
    };

    const handlePointer = (clientX: number, clientY: number) => {
      const { left, top } = rectRef.current;
      const x = clientX - left;
      const y = clientY - top;
      const m = mouseRef.current;
      const speed = Math.hypot(x - m.tx, y - m.ty);
      m.tx = x;
      m.ty = y;
      if (!m.active) {
        m.x = x;
        m.y = y;
      }
      m.active = true;
      if (!prefersReducedMotion && speed > SURGE_SPEED_THRESHOLD) spawnSurge(x, y, speed);
    };

    const onMouseMove = (e: MouseEvent) => handlePointer(e.clientX, e.clientY);
    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      const { left, top } = rectRef.current;
      lastSurgeTimeRef.current = 0;
      spawnSurge(e.clientX - left, e.clientY - top, 60);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) handlePointer(t.clientX, t.clientY);
    };
    const onTouchEnd = () => {
      mouseRef.current.active = false;
    };
    const onReducedMotion = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    reducedMotionQuery.addEventListener("change", onReducedMotion);

    let lastFrame = performance.now();
    let intro = 0;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);

      // Delta-timed so motion stays consistent on any refresh rate.
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const { w, h } = dimsRef.current;
      if (!w || !h) return;

      if (!prefersReducedMotion) timeRef.current += dt * 0.48;
      intro = Math.min(1, intro + dt * 0.9);
      const eased = 1 - Math.pow(1 - intro, 3);

      const t = timeRef.current;
      const m = mouseRef.current;
      // Smooth pointer follow removes the jitter of raw mouse coordinates.
      const follow = 1 - Math.pow(0.0015, dt);
      m.x += (m.tx - m.x) * follow;
      m.y += (m.ty - m.y) * follow;

      const cx = w / 2;
      const cy = h / 2;

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, w, h);

      const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      vignette.addColorStop(0, "rgba(255,255,255,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      const threads = threadsRef.current;
      const bandHeight = h * 0.42;
      const bandWidth = w * 0.86;
      const startX = (w - bandWidth) / 2;
      const surges = surgesRef.current;
      const radius = Math.max(w, h) * 0.22;

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.shadowColor = GLOW;

      threads.forEach((thread, ti) => {
        const baseY = thread.baseY * bandHeight;
        ctx.beginPath();
        for (let s = 0; s <= SEGMENTS; s++) {
          const u = s / SEGMENTS;
          const x = startX + u * bandWidth;
          let y =
            cy +
            baseY * eased +
            Math.sin(u * Math.PI * thread.freq + t * thread.speed + thread.phase) *
              thread.amp *
              eased;

          if (m.active) {
            const dx = x - m.x;
            const dy = y - m.y;
            const dist = Math.hypot(dx, dy);
            if (dist < radius) {
              const falloff = (1 - dist / radius) ** 2;
              const push = falloff * 34 * thread.bulge;
              y += (y < m.y ? -push : push) * 0.6;
              y += Math.sin(t * 2 + ti) * falloff * 4;
            }
          }

          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        let surgeBoost = 0;
        for (const surge of surges) {
          const yAtSurge =
            cy +
            baseY +
            Math.sin(surge.pos * Math.PI * thread.freq + t * thread.speed + thread.phase) *
              thread.amp;
          const dy = Math.abs(yAtSurge - surge.y);
          surgeBoost += Math.max(0, 1 - dy / 60) * surge.life * surge.strength;
        }
        surgeBoost = Math.min(surgeBoost, 0.9);

        ctx.strokeStyle = surgeBoost > 0.7 ? HIGHLIGHT : GLOW;
        ctx.globalAlpha = Math.min(1, thread.alpha + surgeBoost * 0.35) * eased;
        ctx.lineWidth = 0.6 + thread.widthJit * 1.1 + surgeBoost * 0.9;
        ctx.shadowBlur = 6 + surgeBoost * 16;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";

      if (!prefersReducedMotion) {
        const decay = Math.pow(0.05, dt);
        for (let i = surges.length - 1; i >= 0; i--) {
          surges[i]!.life *= decay;
          if (surges[i]!.life < 0.03) surges.splice(i, 1);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    const readyId = requestAnimationFrame(() => setReady(true));

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(readyId);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      reducedMotionQuery.removeEventListener("change", onReducedMotion);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-charcoal">
      <canvas
        ref={canvasRef}
        className="block h-full w-full transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  );
}
