import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Suspense, lazy, useState } from "react";
import { AnimatePresence } from "motion/react";

const GlowingWaveBackground = lazy(() => import("@/components/aura/GlowingWaveBackground"));

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 26, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 1.1, delay, ease },
});



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aura Harmony — Play Music With Your Hands" },
      {
        name: "description",
        content:
          "Aura Harmony turns webcam hand gestures into a grand piano and acoustic guitar — a warm, minimal instrument you play in the air.",
      },
      { property: "og:title", content: "Aura Harmony — Play Music With Your Hands" },
      {
        property: "og:description",
        content:
          "A gesture-controlled piano and guitar in the browser, built with hand tracking and low-latency synthesis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => void navigate({ to: "/play" }), 620);
  };

  return (
    <main className="grain-veil relative min-h-screen overflow-hidden bg-charcoal">
      <ClientOnly fallback={<div className="absolute inset-0 bg-charcoal" />}>
        <Suspense fallback={<div className="absolute inset-0 bg-charcoal" />}>
          <GlowingWaveBackground />
        </Suspense>
      </ClientOnly>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/45 to-transparent" />
      <div className="pointer-events-none absolute -top-40 -right-32 h-[38rem] w-[38rem] rounded-full bg-walnut/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-56 -left-24 h-[34rem] w-[34rem] rounded-full bg-sienna/15 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, scale: 1.03 }}
        animate={leaving ? { opacity: 0, scale: 1.05, filter: "blur(14px)" } : { opacity: 1, scale: 1 }}
        transition={{ duration: leaving ? 0.6 : 1.2, ease }}
        className="pointer-events-none relative mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-8 py-14"
      >
        <motion.p
          {...rise(0.1)}
          className="text-[0.7rem] tracking-[0.42em] text-cream/70 uppercase"
        >
          gesture instrument · no hardware
        </motion.p>

        <div className="max-w-3xl">
          <motion.h1
            {...rise(0.2)}
            className="liquid-type font-display text-[clamp(3.5rem,11vw,9rem)] leading-[0.9] tracking-[0.02em]"
          >
            Aura
            <motion.span {...rise(0.38)} className="block pl-[0.12em] italic text-cream/80">
              Harmony
            </motion.span>
          </motion.h1>

          <motion.p
            {...rise(0.55)}
            className="mt-8 max-w-md text-[0.95rem] leading-relaxed tracking-wide text-cream/80"
          >
            A quiet room, a camera, two hands. Lift them into the light to sound a minimalist
            grand piano, or sweep the air to strum an acoustic guitar. Every gesture becomes tone,
            every tone becomes a slow ripple of colour.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.72, ease }}
            className="mt-12 flex items-center gap-8"
          >
            <button
              type="button"
              onClick={enter}
              className="glass-btn glass-btn-accent pointer-events-auto rounded-full px-12 py-4 text-xs tracking-[0.35em] text-cream uppercase hover:scale-[1.04]"
            >
              enter the room
            </button>
            <span className="text-[0.68rem] tracking-[0.25em] text-cream/60 uppercase">
              webcam required
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.9, ease }}
          className="grid gap-6 border-t border-cream/20 pt-8 text-[0.72rem] tracking-[0.2em] text-cream/70 uppercase sm:grid-cols-3"
        >
          <p>01 — hand tracking in browser</p>
          <p>02 — low-latency synthesis</p>
          <p>03 — nothing leaves your device</p>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {leaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease }}
            className="pointer-events-none fixed inset-0 z-50 bg-greige"
          />
        )}
      </AnimatePresence>
    </main>
  );
}
