export type Landmark = { x: number; y: number; z: number };
export type Hand = {
  landmarks: Landmark[];
  handedness: string;
  pinch: number;
  pinchPoint: Landmark;
  palm: Landmark;
};

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export async function createHandLandmarker() {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  return vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}

export function dist(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function buildHands(
  landmarkSets: Landmark[][],
  handedness: { categoryName?: string }[][],
): Hand[] {
  return landmarkSets.map((lm, i) => {
    const thumb = lm[4]!;
    const index = lm[8]!;
    const span = Math.max(dist(lm[0]!, lm[9]!), 0.001);
    return {
      landmarks: lm,
      handedness: handedness?.[i]?.[0]?.categoryName ?? "Right",
      pinch: dist(thumb, index) / span,
      pinchPoint: {
        x: (thumb.x + index.x) / 2,
        y: (thumb.y + index.y) / 2,
        z: 0,
      },
      palm: lm[9]!,
    };
  });
}
