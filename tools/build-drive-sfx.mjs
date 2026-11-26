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
  0.24 * pulse(t, 0, hz, 120) +
  0.08 * pulse(t, 0.012, hz * 1.7, 160) +
  0.22 * noise * Math.exp(-t * 155);
const install = (t, noise) =>
  0.12 * pulse(t, 0, 161, 44) +
  0.32 * pulse(t, 0.049, 112, 30) +
  0.12 * pulse(t, 0.053, 426, 56) +
  noise * (Math.exp(-t * 32) * 0.12 + Math.exp(-Math.abs(t - 0.049) * 95) * 0.23);
const remove = (t, noise) =>
  0.16 * pulse(t, 0, 322, 52) + 0.25 * pulse(t, 0.094, 138, 27) + 0.23 * noise * Math.exp(-t * 28);
const wheel = (t, noise) => {
  const tool = t < 0.19 ? Math.max(0, Math.sin(t * Math.PI * 55)) * Math.min(1, t * 80) : 0;
  return 0.22 * tool * (noise + Math.sin(t * 2 * Math.PI * 128)) + 0.31 * pulse(t, 0.2, 104, 34);
};

for (const [group, name, duration, render] of [
  ['car', 'car_start', 0.63, motorStart],
  ['car', 'car_bump', 0.25, pothole],
  ['car', 'car_break', 1.05, crash],
  ['ui', 'ui_click', 0.075, click(285)],
  ['ui', 'ui_click_2', 0.075, click(310)],
  ['ui', 'ui_click_3', 0.075, click(340)],
  ['garage', 'tune_install', 0.27, install],
  ['garage', 'tune_remove', 0.29, remove],
  ['garage', 'tune_wheel', 0.36, wheel],
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
