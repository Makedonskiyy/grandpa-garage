#!/usr/bin/env node
/**
 * build-art — пересобирает все пиксельные арты из art/art.json через tools/pixelize.mjs.
 *   npm run art            — всё
 *   npm run art -- menu    — только записи, где output содержит «menu»
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pixelize = fileURLToPath(new URL('./pixelize.mjs', import.meta.url));
const { items } = JSON.parse(readFileSync(new URL('../art/art.json', import.meta.url), 'utf-8'));
const filter = process.argv[2];

for (const item of items) {
  if (filter && !item.output.includes(filter)) continue;
  const args = Object.entries(item.args ?? {}).flatMap(([k, v]) => [`--${k}`, String(v)]);
  execFileSync(process.execPath, [pixelize, item.source, item.output, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
}
