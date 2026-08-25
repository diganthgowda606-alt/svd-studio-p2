import { useEffect, useRef } from "react";

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

const THREAD_COUNT = 46;

/**
 * A dense bundle of translucent, glowing wave threads that undulate on their own,
 * warp around the pointer, and flare when you sweep or click across them.
 * Colours are pulled from the Aura Harmony design tokens.
 */
export default function GlowingWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dimsRef = useRef({ w: 0, h: 0 });
  const mouseRef = useRef({ x: -9999, y: -9999, px: -9999, py: -9999, active: false });
  const surgesRef = useRef<Surge[]>([]);
  const lastSurgeTimeRef = useRef(0);
  const timeRef = useRef(0);
  const threadsRef = useRef<Thread[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
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

    const buildThreads = () => {
      const { h } = dimsRef.current;
      const bandHeight = h * 0.42;
      const threads: Thread[] = [];
      for (let i = 0; i < THREAD_COUNT; i++) {
        const spread = (i / (THREAD_COUNT - 1)) * 2 - 1;
        threads.push({
          baseY: spread * bandHeight * 0.5,
          amp: 10 + Math.random() * 26,
          freq: 1.1 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 0.5,
          widthJit: Math.random(),
          alpha: 0.1 + Math.random() * 0.24,
          bulge: Math.random() * 0.6 + 0.4,
        });
      }
      threadsRef.current = threads;
    };

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dimsRef.current = { w, h };
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildThreads();
    };

    resize();
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(parent);

    const SURGE_COOLDOWN_MS = 55;
    const SURGE_SPEED_THRESHOLD = 10;

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
      if (surgesRef.current.length > 18) surgesRef.current.shift();
    };

    const handlePointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const m = mouseRef.current;
      m.px = m.x;
      m.py = m.y;
      m.x = x;
      m.y = y;
      m.active = true;
      const speed = Math.hypot(x - m.px, y - m.py);
      if (!prefersReducedMotion && speed > SURGE_SPEED_THRESHOLD) spawnSurge(x, y, speed);
    };

    const onMouseMove = (e: MouseEvent) => handlePointer(e.clientX, e.clientY);
    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      lastSurgeTimeRef.current = 0;
      spawnSurge(e.clientX - rect.left, e.clientY - rect.top, 60);
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

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    reducedMotionQuery.addEventListener("change", onReducedMotion);

    const draw = () => {
      const { w, h } = dimsRef.current;
      if (!prefersReducedMotion) timeRef.current += 0.008;
      const t = timeRef.current;
      const m = mouseRef.current;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, w, h);

      const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      vignette.addColorStop(0, "rgba(255,255,255,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      const threads = threadsRef.current;
      const segments = 64;
      const bandWidth = w * 0.86;
      const startX = (w - bandWidth) / 2;
      const surges = surgesRef.current;

      ctx.globalCompositeOperation = "lighter";

      threads.forEach((thread, ti) => {
        ctx.beginPath();
        for (let s = 0; s <= segments; s++) {
          const u = s / segments;
          const x = startX + u * bandWidth;
          let y =
            cy +
            thread.baseY +
            Math.sin(u * Math.PI * thread.freq + t * thread.speed + thread.phase) * thread.amp;

          if (m.active) {
            const dx = x - m.x;
            const dy = y - m.y;
            const dist = Math.hypot(dx, dy);
            const radius = Math.max(w, h) * 0.22;
            if (dist < radius) {
              const falloff = Math.pow(1 - dist / radius, 2);
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
            thread.baseY +
            Math.sin(surge.pos * Math.PI * thread.freq + t * thread.speed + thread.phase) *
              thread.amp;
          const dy = Math.abs(yAtSurge - surge.y);
          surgeBoost += Math.max(0, 1 - dy / 60) * surge.life * surge.strength;
        }
        surgeBoost = Math.min(surgeBoost, 1.6);

        ctx.strokeStyle = surgeBoost > 0.5 ? HIGHLIGHT : GLOW;
        ctx.globalAlpha = Math.min(1, thread.alpha + surgeBoost * 0.5);
        ctx.lineWidth = 0.6 + thread.widthJit * 1.1 + surgeBoost * 1.4;
        ctx.shadowColor = GLOW;
        ctx.shadowBlur = 8 + surgeBoost * 20;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";

      if (!prefersReducedMotion) {
        for (let i = surges.length - 1; i >= 0; i--) {
          surges[i]!.life *= 0.92;
          if (surges[i]!.life < 0.03) surges.splice(i, 1);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      reducedMotionQuery.removeEventListener("change", onReducedMotion);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-charcoal">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
