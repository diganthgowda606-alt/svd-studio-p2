import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Suspense, lazy } from "react";

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
  return (
    <main className="grain-veil relative min-h-screen overflow-hidden bg-charcoal">
      <ClientOnly>
        <GlowingWaveBackground />
      </ClientOnly>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/45 to-transparent" />
      <div className="pointer-events-none absolute -top-40 -right-32 h-[38rem] w-[38rem] rounded-full bg-walnut/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-56 -left-24 h-[34rem] w-[34rem] rounded-full bg-sienna/15 blur-3xl" />

      <div className="pointer-events-none relative mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-8 py-14">

        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
          className="text-[0.7rem] tracking-[0.42em] text-cream/70 uppercase"
        >
          gesture instrument · no hardware
        </motion.p>

        <div className="max-w-3xl">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(3.5rem,11vw,9rem)] leading-[0.9] text-cream"
          >
            Aura
            <span className="block pl-[0.12em] italic text-cream/80">Harmony</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.25 }}
            className="mt-8 max-w-md text-[0.95rem] leading-relaxed tracking-wide text-cream/80"
          >
            A quiet room, a camera, two hands. Lift them into the light to sound a minimalist
            grand piano, or sweep the air to strum an acoustic guitar. Every gesture becomes tone,
            every tone becomes a slow ripple of colour.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-12 flex items-center gap-8"
          >
            <Link
              to="/play"
              className="pointer-events-auto rounded-full bg-sienna px-12 py-4 text-xs tracking-[0.35em] text-cream uppercase transition-all duration-500 hover:scale-[1.04] hover:bg-charcoal"
            >
              enter the room
            </Link>
            <span className="text-[0.68rem] tracking-[0.25em] text-cream/60 uppercase">
              webcam required
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="grid gap-6 border-t border-cream/20 pt-8 text-[0.72rem] tracking-[0.2em] text-cream/70 uppercase sm:grid-cols-3"
        >
          <p>01 — hand tracking in browser</p>
          <p>02 — low-latency synthesis</p>
          <p>03 — nothing leaves your device</p>
        </motion.div>
      </div>
    </main>
  );
}
