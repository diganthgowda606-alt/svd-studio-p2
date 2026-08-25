import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";
import { motion } from "motion/react";

const PerformanceStage = lazy(() => import("@/components/aura/PerformanceStage"));

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Performance Space — Aura Harmony" },
      {
        name: "description",
        content:
          "Step into the Aura Harmony performance space: play a minimalist grand piano or acoustic guitar with webcam hand gestures.",
      },
      { property: "og:title", content: "Performance Space — Aura Harmony" },
      {
        property: "og:description",
        content: "Play piano and guitar in the air with real-time hand tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Play,
});

function Play() {
  const [mounted, setMounted] = useState(false);
  const [veiled, setVeiled] = useState(true);
  useEffect(() => setMounted(true), []);

  return (
    <main className="grain-veil relative min-h-screen bg-greige">
      {mounted ? (
        <Suspense fallback={<Loading />}>
          <PerformanceStage />
        </Suspense>
      ) : (
        <Loading />
      )}

      {/* flow-in veil: opaque on first paint, dissolving into the room */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => setVeiled(false)}
        style={{ display: veiled ? "block" : "none" }}
        className="pointer-events-none fixed inset-0 z-40 bg-greige"
      />
    </main>
  );
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="animate-pulse text-xs tracking-[0.4em] text-cream/70 uppercase">
        preparing the room
      </p>
    </div>
  );
}
