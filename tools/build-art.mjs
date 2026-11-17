#!/usr/bin/env node
/**
 * build-art — пересобирает все пиксельные арты.
 *
 * 1. Записи из art/art.json (фоны меню и гаража) — через tools/pixelize.mjs.
 * 2. Фоны сцен истории из data/story-backgrounds.json: если лежит исходник
 *    art/source/story/<ключ>.(jpg|jpeg|png|webp), из него собирается
 *    public/assets/images/story/<ключ>.png и фон прописывается в data/assets.json.
 *    Параметры по умолчанию — art.json → storyDefaults, для отдельного фона — story.<ключ>.
 *
 *   npm run art            — всё
 *   npm run art -- menu    — только то, где путь результата содержит «menu»
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const root = fileURLToPath(new URL('..', import.meta.url));
const pixelize = fileURLToPath(new URL('./pixelize.mjs', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(`${root}${p}`, 'utf-8'));
const art = readJson('art/art.json');
const filter = process.argv[2];

const run = (source, output, args = {}) => {
  const flags = Object.entries(args).flatMap(([k, v]) => [`--${k}`, String(v)]);
  execFileSync(process.execPath, [pixelize, source, output, ...flags], {
    cwd: root,
    stdio: 'inherit',
  });
};

for (const item of art.items) {
  if (filter && !item.output.includes(filter)) continue;
  run(item.source, item.output, item.args);
}

// ---------- Фоны сцен истории ----------
const { backgrounds } = readJson('data/story-backgrounds.json');
const EXT = ['jpg', 'jpeg', 'png', 'webp'];
const missing = [];
for (const key of Object.keys(backgrounds)) {
  const output = `public/assets/images/story/${key}.png`;
  if (filter && !output.includes(filter)) continue;
  const source = EXT.map((e) => `art/source/story/${key}.${e}`).find((p) =>
    existsSync(`${root}${p}`),
  );
  if (!source) {
    missing.push(key);
    continue;
  }
  run(source, output, { ...art.storyDefaults, ...(art.story?.[key] ?? {}) });
}

// Манифест загрузки: фоны истории, у которых есть готовый файл.
const manifest = readJson('data/assets.json');
manifest.images = manifest.images.filter((i) => !i.key.startsWith('story_'));
for (const key of Object.keys(backgrounds)) {
  const path = `assets/images/story/${key}.png`;
  if (existsSync(`${root}public/${path}`)) manifest.images.push({ key: `story_${key}`, path });
}
writeFileSync(
  `${root}data/assets.json`,
  await format(JSON.stringify(manifest), { parser: 'json' }),
);

if (missing.length) {
  console.log(`\nФоны истории без исходника (пока временные): ${missing.join(', ')}`);
  console.log('Положите art/source/story/<ключ>.jpg и запустите npm run art ещё раз.');
}
