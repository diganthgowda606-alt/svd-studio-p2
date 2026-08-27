import * as Tone from "tone";

export type InstrumentKind = "piano" | "guitar" | "violin" | "chords";

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

/* ---- Aura Violin: one continuously bowed voice ---- */
let violin: Tone.FMSynth | null = null;
let violinFilter: Tone.Filter | null = null;
let violinVibrato: Tone.Vibrato | null = null;
let violinNote: string | null = null;

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
  pad.volume.value = -2;

  // Violin: sustained bowed voice with vibrato and a bow-pressure filter
  violinVibrato = new Tone.Vibrato({ frequency: 5.2, depth: 0.12 }).connect(reverb);
  violinFilter = new Tone.Filter({ type: "lowpass", frequency: 2200, Q: 1.1 }).connect(
    violinVibrato,
  );
  violin = new Tone.FMSynth({
    harmonicity: 2.02,
    modulationIndex: 6.5,
    oscillator: { type: "sawtooth" },
    modulation: { type: "sine" },
    envelope: { attack: 0.16, decay: 0.2, sustain: 0.9, release: 0.5 },
    modulationEnvelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.4 },
  }).connect(violinFilter);
  violin.volume.value = -12;

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

/* ---- violin ---- */

/** bow intensity 0..1 -> loudness, brightness and vibrato depth */
export function setViolinIntensity(value: number) {
  const v = Math.min(1, Math.max(0, value));
  if (violin) violin.volume.rampTo(-26 + v * 20, 0.12);
  if (violinFilter) violinFilter.frequency.rampTo(700 + v * 4200, 0.12);
  if (violinVibrato) violinVibrato.depth.rampTo(0.05 + v * 0.22, 0.2);
}

/** start or glide the bowed note; retriggers only when the pitch changes */
export function bowViolin(note: string, velocity = 0.8) {
  if (!violin) return;
  if (violinNote === note) return;
  if (violinNote) {
    violin.frequency.rampTo(Tone.Frequency(note).toFrequency(), 0.06);
  } else {
    violin.triggerAttack(note, undefined, velocity);
  }
  violinNote = note;
}

export function stopViolin() {
  if (!violin || !violinNote) return;
  violin.triggerRelease();
  violinNote = null;
}

export function getWaveform(): Float32Array | null {
  if (!analyser) return null;
  return analyser.getValue() as Float32Array;
}

export function transpose(note: string, semitones: number) {
  return Tone.Frequency(note).transpose(semitones).toNote();
}

/* ---- chord pad ---- */

/** tone colour 0..1 -> filter cutoff (dark, woody -> bright, glassy) */
export function setToneColor(value: number) {
  if (!padFilter) return;
  const v = Math.min(1, Math.max(0, value));
  padFilter.frequency.rampTo(320 * Math.pow(18, v), 0.12);
}

/** hold a chord; retriggers only the notes that changed */
export function playChord(notes: string[], velocity = 0.6) {
  if (!pad) return;
  const same = notes.length === padNotes.length && notes.every((n, i) => n === padNotes[i]);
  if (same) return;
  const release = padNotes.filter((n) => !notes.includes(n));
  const attack = notes.filter((n) => !padNotes.includes(n));
  if (release.length) pad.triggerRelease(release);
  if (attack.length) pad.triggerAttack(attack, undefined, velocity);
  padNotes = [...notes];
}

export function stopChord() {
  if (!pad || !padNotes.length) return;
  pad.triggerRelease(padNotes);
  padNotes = [];
}
