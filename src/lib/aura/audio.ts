import * as Tone from "tone";

export type InstrumentKind = "piano" | "guitar" | "drums" | "chords";

export const PIANO_NOTES = [
  "C3",
  "D3",
  "E3",
  "F3",
  "G3",
  "A3",
  "B3",
  "C4",
  "D4",
  "E4",
  "F4",
  "G4",
  "A4",
  "B4",
  "C5",
  "D5",
  "E5",
  "G5",
];

export const GUITAR_STRINGS = ["E2", "A2", "D3", "G3", "B3", "E4"];

let started = false;
let volumeNode: Tone.Volume | null = null;
let reverb: Tone.Reverb | null = null;
let piano: Tone.PolySynth<Tone.Synth> | null = null;
let guitar: Tone.PluckSynth | null = null;
let analyser: Tone.Analyser | null = null;
let pad: Tone.PolySynth<Tone.Synth> | null = null;
let padFilter: Tone.Filter | null = null;
let padNotes: string[] = [];

/* ---- Infernal Pulse drum voices ---- */
type DrumVoices = {
  kick: Tone.MembraneSynth;
  snareBody: Tone.MembraneSynth;
  snareWire: Tone.NoiseSynth;
  tom: Tone.MembraneSynth;
  hat: Tone.MetalSynth;
  cymbal: Tone.MetalSynth;
};
let drums: DrumVoices | null = null;

export async function startAudio() {
  if (started) return;
  await Tone.start();
  Tone.getContext().lookAhead = 0.01;

  volumeNode = new Tone.Volume(-6).toDestination();
  analyser = new Tone.Analyser("waveform", 512);
  volumeNode.connect(analyser);

  reverb = new Tone.Reverb({ decay: 3.2, wet: 0.28 }).connect(volumeNode);

  piano = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 1.1, sustain: 0.08, release: 1.6 },
  }).connect(reverb);
  piano.maxPolyphony = 16;
  piano.volume.value = -8;

  guitar = new Tone.PluckSynth({
    attackNoise: 1.2,
    dampening: 3600,
    resonance: 0.94,
  }).connect(reverb);
  guitar.volume.value = -2;

  // Chord pad: sustained, filtered voice steered by the tone control
  padFilter = new Tone.Filter({ type: "lowpass", frequency: 1400, Q: 0.8 }).connect(reverb);
  pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.28, decay: 0.6, sustain: 0.75, release: 1.4 },
  }).connect(padFilter);
  pad.maxPolyphony = 12;
  pad.volume.value = -14;

  // Drum bus: tight, punchy, minimal reverb for metal articulation
  const drumRoom = new Tone.Reverb({ decay: 1.4, wet: 0.12 }).connect(volumeNode);
  const punch = new Tone.Compressor({ threshold: -18, ratio: 4, attack: 0.003, release: 0.12 }).connect(
    drumRoom,
  );

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.028,
    octaves: 7,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.18 },
  }).connect(punch);
  kick.volume.value = 0;

  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.05 },
  }).connect(punch);
  snareBody.volume.value = -12;

  const snareWire = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.03 },
  }).connect(punch);
  snareWire.volume.value = -8;

  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.25 },
  }).connect(punch);
  tom.volume.value = -6;

  const hat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 7000,
    octaves: 1.5,
  }).connect(punch);
  hat.volume.value = -22;

  const cymbal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.6, release: 1.2 },
    harmonicity: 3.6,
    modulationIndex: 42,
    resonance: 5200,
    octaves: 2,
  }).connect(drumRoom);
  cymbal.volume.value = -26;

  drums = { kick, snareBody, snareWire, tom, hat, cymbal };

  started = true;
}

export function isAudioStarted() {
  return started;
}

export function setMasterVolume(value: number) {
  if (!volumeNode) return;
  volumeNode.volume.rampTo(value <= 0 ? -60 : Tone.gainToDb(value), 0.08);
}

export function playPiano(note: string, velocity = 0.8) {
  piano?.triggerAttackRelease(note, "2n", undefined, velocity);
}

export function pluckGuitar(note: string, velocity = 0.8) {
  guitar?.triggerAttackRelease(note, "8n", undefined, velocity);
}

export type DrumVoice =
  | { kind: "kick"; note: string }
  | { kind: "snare" }
  | { kind: "tom"; note: string }
  | { kind: "hat"; open?: boolean }
  | { kind: "cymbal"; freq: number; decay: number };

export function playDrum(voice: DrumVoice, velocity = 0.9) {
  if (!drums) return;
  const t = Tone.now();
  switch (voice.kind) {
    case "kick":
      drums.kick.triggerAttackRelease(voice.note, "8n", t, velocity);
      break;
    case "snare":
      drums.snareBody.triggerAttackRelease("G2", "16n", t, velocity * 0.8);
      drums.snareWire.triggerAttackRelease("16n", t, velocity);
      break;
    case "tom":
      drums.tom.triggerAttackRelease(voice.note, "8n", t, velocity);
      break;
    case "hat":
      drums.hat.envelope.decay = voice.open ? 0.32 : 0.05;
      drums.hat.triggerAttackRelease("32n", t, velocity);
      break;
    case "cymbal":
      drums.cymbal.frequency.value = voice.freq;
      drums.cymbal.envelope.decay = voice.decay;
      drums.cymbal.triggerAttackRelease("8n", t, velocity);
      break;
  }
}

export function getWaveform(): Float32Array | null {
  if (!analyser) return null;
  return analyser.getValue() as Float32Array;
}

export function transpose(note: string, semitones: number) {
  return Tone.Frequency(note).transpose(semitones).toNote();
}
