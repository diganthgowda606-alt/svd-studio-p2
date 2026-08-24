import * as Tone from "tone";

export type InstrumentKind = "piano" | "guitar";

export const PIANO_NOTES = [
  "C3",
  "D3",
  "E3",
  "G3",
  "A3",
  "C4",
  "D4",
  "E4",
  "G4",
  "A4",
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
  piano.volume.value = -8;

  guitar = new Tone.PluckSynth({
    attackNoise: 1.2,
    dampening: 3600,
    resonance: 0.94,
  }).connect(reverb);
  guitar.volume.value = -2;

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
  guitar?.triggerAttackRelease(note, undefined, undefined, velocity);
}

export function getWaveform(): Float32Array | null {
  if (!analyser) return null;
  return analyser.getValue() as Float32Array;
}

export function transpose(note: string, semitones: number) {
  return Tone.Frequency(note).transpose(semitones).toNote();
}
