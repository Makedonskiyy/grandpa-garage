/** Синтез коротких звуков машины. Запуск: node tools/build-drive-sfx.mjs (нужен FFmpeg). */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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

const click = (hz) => (t, noise) =>
  0.35 * pulse(t, 0, hz, 95) +
  0.17 * pulse(t, 0.018, hz * 1.4, 125) +
  0.16 * noise * Math.exp(-t * 170);
const install = (t, noise) =>
  0.45 * pulse(t, 0, 102, 25) +
  0.22 * pulse(t, 0.09, 508, 31) +
  0.16 * pulse(t, 0.17, 660, 40) +
  0.35 * pulse(t, 0.26, 155, 23) +
  noise * Math.exp(-t * 28) * 0.28;
const remove = (t, noise) =>
  0.24 * pulse(t, 0, 480, 32) +
  0.18 * pulse(t, 0.08, 395, 36) +
  0.42 * pulse(t, 0.25, 96, 20) +
  0.26 * noise * Math.exp(-t * 26);
const wheel = (t, noise) => {
  const tool = t < 0.33 ? Math.max(0, Math.sin(t * Math.PI * 66)) * Math.min(1, t * 80) : 0;
  return (
    0.35 * tool * (noise + Math.sin(t * 2 * Math.PI * 160)) +
    0.37 * pulse(t, 0.34, 112, 27) +
    0.19 * pulse(t, 0.35, 430, 34)
  );
};

for (const [group, name, duration, render] of [
  ['car', 'car_start', 0.63, motorStart],
  ['car', 'car_bump', 0.25, pothole],
  ['car', 'car_break', 1.05, crash],
  ['ui', 'ui_click_2', 0.12, click(510)],
  ['ui', 'ui_click_3', 0.12, click(670)],
  ['garage', 'tune_install', 0.55, install],
  ['garage', 'tune_remove', 0.55, remove],
  ['garage', 'tune_wheel', 0.62, wheel],
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
  const folder = new URL(`../src/assets/audio/${group}/`, import.meta.url);
  mkdirSync(folder, { recursive: true });
  const path = fileURLToPath(new URL(`${name}.mp3`, folder));
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
