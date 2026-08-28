import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sampleRate = 48_000;
const durationSeconds = 46;
const channels = 2;
const sampleCount = sampleRate * durationSeconds;
const data = Buffer.alloc(sampleCount * channels * 2);
let seed = 0x4d595df4;

const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const writeInt16 = (offset, value) => {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), offset);
};

for (let i = 0; i < sampleCount; i += 1) {
  const t = i / sampleRate;
  const fadeIn = Math.min(1, t / 1.4);
  const fadeOut = Math.min(1, Math.max(0, (durationSeconds - t) / 3));
  const bedFade = fadeIn * fadeOut;
  const pulse = 0.52 + 0.48 * Math.sin((Math.PI * 2 * t) / 4.2);
  const sub = Math.sin(Math.PI * 2 * 86 * t) * 0.055;
  const overtone = Math.sin(Math.PI * 2 * 172 * t + 0.2) * 0.018;
  const shimmer = Math.sin(Math.PI * 2 * 344 * t + Math.sin(t * 1.1) * 0.8) * 0.008;
  const grain = (random() * 2 - 1) * 0.006 * (0.3 + 0.7 * pulse);
  const pulsePhase = t % 2.8;
  const pulseEnv = Math.max(0, 1 - pulsePhase / 0.17);
  const click = Math.sin(Math.PI * 2 * (620 + pulsePhase * 380) * t) * pulseEnv * 0.025;
  const mono = (sub + overtone + shimmer + grain + click) * bedFade;
  const stereoOffset = Math.sin(Math.PI * 2 * 0.13 * t) * 0.002;
  const left = (mono + stereoOffset) * 32767;
  const right = (mono - stereoOffset) * 32767;
  const offset = i * channels * 2;
  writeInt16(offset, left);
  writeInt16(offset + 2, right);
}

const output = resolve(process.cwd(), "public", "ambient-bed.wav");
mkdirSync(dirname(output), { recursive: true });
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
writeFileSync(output, Buffer.concat([header, data]));
console.log(`Generated ${output} (${durationSeconds}s, ${sampleRate}Hz stereo WAV)`);
