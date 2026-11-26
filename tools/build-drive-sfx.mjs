/** Синтез коротких звуков машины. Запуск: node tools/build-drive-sfx.mjs (нужен FFmpeg). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const pulse = (t, at, hz, decay) => {
  const d = t - at;
  return d < 0 ? 0 : Math.sin(2 * Math.PI * hz * d) * Math.exp(-d * decay);
};
const motorStart = (t, noise) => {
  const crank = Math.min(1, t * 90) * Math.max(0, 1 - Math.max(0, t - 0.2) * 15);
  const phase = 2 * Math.PI * (46 * t + 25 * t * t);
  const starter = crank * (0.18 * Math.sin(phase) + 0.08 * Math.sin(phase * 7) + 0.1 * noise);
  const catchMotor = pulse(t, 0.235, 54, 13) * 0.38 + pulse(t, 0.235, 108, 19) * 0.16;
  return starter + catchMotor;
};
const pothole = (t, noise) =>
  0.55 * pulse(t, 0, 73, 35) + 0.21 * pulse(t, 0.026, 122, 35) + noise * Math.exp(-t * 115) * 0.24;
const crash = (t, noise) =>
  0.35 * pulse(t, 0, 48, 12) +
  0.19 * pulse(t, 0.025, 197, 19) +
  0.12 * pulse(t, 0.09, 369, 14) +
  0.09 * pulse(t, 0.23, 123, 21) +
  noise * (0.55 * Math.exp(-t * 18) + 0.12 * Math.exp(-t * 5));

for (const [name, duration, render] of [
  ['car_start', 0.63, motorStart],
  ['car_bump', 0.25, pothole],
  ['car_break', 1.05, crash],
]) {
  const samples = Buffer.alloc(Math.round(duration * RATE) * 4);
  let seed = 51;
  let filtered = 0;
  for (let i = 0; i < samples.length / 4; i++) {
    const t = i / RATE;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    filtered += (seed / 2 ** 31 - 1 - filtered) * 0.48;
    const edge = Math.min(1, t * 550, (duration - t) * 70);
    samples.writeFloatLE(Math.tanh(render(t, filtered)) * edge, i * 4);
  }
  const path = fileURLToPath(new URL(`../src/assets/audio/car/${name}.mp3`, import.meta.url));
  const result = spawnSync(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-y',
      '-f',
      'f32le',
      '-ar',
      String(RATE),
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      path,
    ],
    { input: samples, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg не записал ${name}`);
}
