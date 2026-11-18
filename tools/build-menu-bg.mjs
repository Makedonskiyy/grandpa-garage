#!/usr/bin/env node
/**
 * build-menu-bg — фон главного меню из art/source/menu.jpg: пиксели функциями скилла codixel (как фон гаража).
 *   npm run menu-bg
 */
import sharp from 'sharp';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}art/source/menu.jpg`;
const OUT = `${ROOT}public/assets/images/bg/menu_garage.png`;
const CODIXEL = `${ROOT}.claude/skills/codixel/core/pixel.js`;
if (!existsSync(CODIXEL)) throw new Error('Нужен скилл codixel: .claude/skills/codixel');
// Файл codixel — обычный скрипт (CommonJS), а пакет проекта — ES-модули: запускаем его в vm.
const codixelModule = { exports: {} };
const codixelSource = `(function (module, require) {\n${readFileSync(CODIXEL, 'utf8')}\n})`;
vm.runInThisContext(codixelSource, { filename: CODIXEL })(
  codixelModule,
  createRequire(import.meta.url),
);
const P = codixelModule.exports;

// Разметка фото (px исходника 2752×1536).
const CUT_FROM = 820; // ниже надписей на стене
const BRICK = 37; // шаг кладки
const CUT = BRICK * 9; // 333 — девять рядов
const FLOOR_FROM = 1262; // низ стены
const ART = { w: 320, h: 180 };
const GRADE = { brightness: 0.86, saturation: 1.22, warm: 0.05 };
const COLORS = 48;

const composed = await sharp(SRC)
  .resize(2752, 1548, { fit: 'cover' })
  .modulate({ brightness: GRADE.brightness, saturation: GRADE.saturation })
  .raw()
  .ensureAlpha()
  .toBuffer({ resolveWithObject: true });

// codixel: буфер — Uint32 ABGR, как у RGBA-байтов в little-endian.
const src = new P.Buf(composed.info.width, composed.info.height);
src.px.set(
  new Uint32Array(composed.data.buffer, composed.data.byteOffset, composed.data.length / 4),
);
const small = P.resize(src, ART.w, ART.h);
const { buf: quant } = P.quantize(small, COLORS, { dither: true });
const clean = P.cleanup(quant, { tol: 20 });

const raw = Buffer.from(clean.px.buffer, clean.px.byteOffset, clean.px.byteLength);
await sharp(raw, { raw: { width: ART.w, height: ART.h, channels: 4 } })
  .resize(ART.w * 2, ART.h * 2, { kernel: 'nearest' })
  .png()
  .toFile(OUT);

console.log(`✓ ${OUT.replace(ROOT, '')}: арт ${ART.w}×${ART.h}, ${COLORS} цветов; `);
