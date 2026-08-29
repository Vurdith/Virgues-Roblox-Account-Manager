import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sampleRate = 48_000;
const durationSeconds = 24;
const channels = 2;
const bpm = 104;
const beatLength = 60 / bpm;
const sampleCount = sampleRate * durationSeconds;
const data = Buffer.alloc(sampleCount * channels * 2);

let seed = 0x2f6e2b1;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const midi = (value) => 440 * 2 ** ((value - 69) / 12);

const clamp = (value) => Math.max(-1, Math.min(1, value));
const smooth = (value) => value * value * (3 - 2 * value);
const decay = (time, release) => Math.exp(-time / release);
const sine = (frequency, time) => Math.sin(Math.PI * 2 * frequency * time);
const triangle = (frequency, time) => {
  const phase = (frequency * time) % 1;
  return 1 - 4 * Math.abs(Math.round(phase) - phase);
};

const softClip = (value) => Math.tanh(value * 1.2) / Math.tanh(1.2);

const chordProgression = [
  { notes: [57, 60, 64, 67], root: 45 },
  { notes: [53, 57, 60, 64], root: 41 },
  { notes: [48, 52, 55, 59], root: 36 },
  { notes: [55, 59, 62, 65], root: 43 },
];

const writeInt16 = (offset, value) => {
  data.writeInt16LE(Math.round(clamp(value) * 32767), offset);
};

let bodyNoise = 0;
let hatNoise = 0;

for (let sample = 0; sample < sampleCount; sample += 1) {
  const time = sample / sampleRate;
  const beatNumber = Math.floor(time / beatLength);
  const beatTime = time - beatNumber * beatLength;
  const beatInBar = beatNumber % 4;
  const barNumber = Math.floor(beatNumber / 4);
  const barTime = time - barNumber * beatLength * 4;
  const chord = chordProgression[barNumber % chordProgression.length];
  const fadeIn = smooth(Math.min(1, time / 0.45));
  const fadeOut = smooth(Math.min(1, Math.max(0, (durationSeconds - time) / 1.2)));
  const masterFade = fadeIn * fadeOut;

  const chordPhase = barTime / (beatLength * 4);
  const padEnvelope = 0.64 + 0.36 * Math.sin(chordPhase * Math.PI);
  const pad = chord.notes.reduce((sum, note, index) => {
    const detuned = sine(midi(note) * (1 + (index - 1.5) * 0.00045), time);
    const voice = detuned + sine(midi(note) * 2, time + index * 0.003) * 0.16;
    return sum + voice * 0.022;
  }, 0) * padEnvelope;

  const bassBeatTime = time - Math.floor(time / beatLength) * beatLength;
  const bassNote = chord.root + (beatInBar === 3 ? 12 : 0);
  const bassEnvelope = decay(bassBeatTime, 0.34) * Math.min(1, bassBeatTime / 0.012);
  const bass = (sine(midi(bassNote), bassBeatTime) + sine(midi(bassNote) * 2, bassBeatTime) * 0.08) * bassEnvelope * 0.105;

  const kickActive = beatInBar === 0 || beatInBar === 2;
  const kickPitch = 52 + 76 * Math.exp(-beatTime * 22);
  const kick = kickActive ? sine(kickPitch, beatTime) * decay(beatTime, 0.088) * 0.16 : 0;

  const snareActive = beatInBar === 1 || beatInBar === 3;
  bodyNoise = bodyNoise * 0.97 + (random() * 2 - 1) * 0.03;
  const snare = snareActive
    ? (bodyNoise * 0.42 + sine(188, beatTime) * 0.08) * decay(beatTime, 0.066) * 0.058
    : 0;

  const eighthNumber = Math.floor(time / (beatLength / 2));
  const eighthTime = time - eighthNumber * (beatLength / 2);
  hatNoise = hatNoise * 0.72 + (random() * 2 - 1) * 0.28;
  const hat = ((eighthNumber + 1) % 2 === 0 ? 0.68 : 0.4) * hatNoise * decay(eighthTime, 0.022) * 0.021;

  const pluckNumber = Math.floor(time / (beatLength / 2));
  const pluckTime = time - pluckNumber * (beatLength / 2);
  const motif = [0, 1, 2, 1, 0, 1, 3, 2];
  const pluckNote = chord.notes[motif[(pluckNumber + barNumber) % motif.length]] + 12;
  const pluckEnvelope = Math.min(1, pluckTime / 0.004) * decay(pluckTime, 0.17);
  const pluck = (triangle(midi(pluckNote), pluckTime) * 0.7 + sine(midi(pluckNote) * 2, pluckTime) * 0.3) * pluckEnvelope * 0.038;

  const chordHitTime = time - Math.floor(time / beatLength) * beatLength;
  const chordHit = (sine(midi(chord.notes[1]), chordHitTime) + sine(midi(chord.notes[2]), chordHitTime) * 0.42) * decay(chordHitTime, 0.18) * 0.022;
  const mono = (pad + bass + kick + snare + hat + pluck + chordHit) * masterFade;
  const stereo = Math.sin(Math.PI * 2 * 0.17 * time) * 0.002 + pluck * 0.2;
  const offset = sample * channels * 2;
  writeInt16(offset, softClip((mono + stereo) * 0.86));
  writeInt16(offset + 2, softClip((mono - stereo) * 0.86));
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * 2, 28);
header.writeUInt16LE(channels * 2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

const output = resolve(process.cwd(), "public", "music-bed.wav");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, data]));
console.log(`Generated ${output} (${durationSeconds}s, ${bpm} BPM, ${sampleRate}Hz stereo WAV)`);
