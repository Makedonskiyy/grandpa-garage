/**
 * scenery — пейзажи и объекты трасс обкатки, пиксели в единицах мира (рисуется кодом).
 * Три темы — по карте:
 *   mud   — «Грунтовка за гаражами»: панельки и ЛЭП вдали, ряд гаражей с берёзами,
 *           раскисшая колея; у дороги — покрышки, брошенная «копейка», вороны;
 *   track — «Автодром ДОСААФ»: трибуна со зрителями, баннер, флаги, асфальт с бордюром;
 *           на трассе — лежачие полицейские, отметка 100 км/ч, зона остановки из конусов;
 *   free  — «Объездная дорога»: поле, лес, храм вдали, ЛЭП; асфальт и грунт чередуются,
 *           остановка «Совхоз», указатель на Москву, «газель», километровые столбики.
 * Фоны — бесшовные по ширине текстуры 640×360 (параллакс); объекты трассы — в метрах.
 */
const W = 640;
const H = 360;

/** Детерминированный генератор: пейзаж одинаков при каждом запуске. */
export function rng(seed) {
  let v = seed;
  return () => (v = (v * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function tex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g, rng(key.length * 131 + w));
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

// ---------- Общие куски фона ----------

function sky(g, stops) {
  stops.forEach((c, i) => g.fillStyle(c).fillRect(0, i * 34, W, 35));
}

/** Девятиэтажки: прямоугольники с сеткой окон, часть горит. */
function panels(
  g,
  r,
  { base, y, minH = 40, maxH = 80, lit = 0.15, litColor = 0xe9d7a8, wall, win },
) {
  let x = -10;
  while (x < W) {
    const w = 44 + Math.floor(r() * 46);
    const h = minH + Math.floor(r() * (maxH - minH));
    g.fillStyle(wall).fillRect(x, y - h, w, h + 60);
    g.fillStyle(base).fillRect(x + w - 3, y - h, 3, h + 60);
    g.fillStyle(base).fillRect(x, y - h, w, 2);
    for (let wy = y - h + 5; wy < y - 2; wy += 6)
      for (let wx = x + 3; wx < x + w - 5; wx += 5)
        g.fillStyle(r() < lit ? litColor : win).fillRect(wx, wy, 2, 3);
    x += w + 4 + Math.floor(r() * 26);
  }
}

/** Опора ЛЭП с проводами до края. */
function powerLine(g, x, y, h, color = 0x5b6066) {
  g.fillStyle(color).fillRect(x, y - h, 2, h);
  g.fillRect(x - 8, y - h + 4, 18, 2);
  g.fillRect(x - 6, y - h + 10, 14, 1);
  for (let k = 0; k < h - 12; k += 6) g.fillRect(x - 2 + (k % 12 ? 0 : 2), y - h + 12 + k, 6, 1);
}

function wires(g, y, color = 0x4c5258) {
  for (let x = 0; x < W; x += 2) {
    const sag = Math.sin((x / W) * Math.PI * 4) * 3;
    g.fillStyle(color).fillRect(x, y + sag, 2, 1);
    g.fillRect(x, y + 6 + sag, 2, 1);
  }
}

/** Берёза: белый ствол с чёрными чёрточками, редкая крона (ноябрь — почти голая). */
function birch(g, r, x, base, h, leaves = 0xb8a04c) {
  g.fillStyle(0xe9e6dc).fillRect(x, base - h, 3, h);
  for (let y = base - h + 4; y < base; y += 5 + Math.floor(r() * 4))
    g.fillStyle(0x2a2a2a).fillRect(x + Math.floor(r() * 2), y, 2, 1);
  for (let i = 0; i < 26; i++) {
    const bx = x + 1 + Math.floor((r() - 0.5) * 22);
    const by = base - h + Math.floor(r() * h * 0.5);
    g.fillStyle(r() < 0.6 ? 0x6b6258 : leaves).fillRect(bx, by, 2, 1);
  }
}

// ---------- Фоны по темам ----------

/** Слои параллакса: далёкий, средний, дорога. */
export function backdrop(scene, theme) {
  if (theme === 'track') return backdropTrack(scene);
  if (theme === 'free') return backdropFree(scene);
  return backdropMud(scene);
}

function backdropMud(scene) {
  const far = tex(scene, 'sc_mud_far', W, H, (g, r) => {
    sky(g, [0xaeb7c1, 0xb7bfc8, 0xc0c7ce, 0xc9ced3, 0xd1d4d6]);
    g.fillStyle(0xd6d8d8).fillRect(0, 170, W, 70);
    panels(g, r, { y: 200, wall: 0x9aa3ad, base: 0x8c96a1, win: 0x7f8994 });
    for (const x of [90, 330, 560]) powerLine(g, x, 214, 70, 0x6d737a);
    wires(g, 150, 0x6d737a);
    g.fillStyle(0x8a8c8a).fillRect(0, 212, W, 20);
  });
  const mid = tex(scene, 'sc_mud_mid', W, H, (g, r) => {
    // Ряд гаражей: кирпич, крашеные ворота, снег на крышах, номера мелом.
    const gates = [0x4f5d52, 0x5b5f66, 0x6b5a48, 0x4b5866, 0x5f5246, 0x6a3f3a];
    for (let gx = 0, i = 0; gx < W; gx += 64, i++) {
      g.fillStyle(0x7a6f66).fillRect(gx, 200, 64, 58);
      for (let by = 202; by < 256; by += 4) g.fillStyle(0x6e645c).fillRect(gx, by, 64, 1);
      g.fillStyle(0x5d544d).fillRect(gx, 200, 2, 58);
      g.fillStyle(gates[i % gates.length]).fillRect(gx + 10, 214, 44, 44);
      g.fillStyle(0x000000, 0.2).fillRect(gx + 31, 214, 2, 44);
      g.fillStyle(0xe8e3d6).fillRect(gx + 14, 218, 6, 3); // номер мелом
      g.fillStyle(0xeef1f3).fillRect(gx - 2, 196, 68, 5);
      // Ржавые потёки.
      if (r() < 0.6)
        g.fillStyle(0x8a4a2a, 0.6).fillRect(gx + 12 + Math.floor(r() * 36), 216, 1, 10);
    }
    for (let i = 0; i < 6; i++)
      birch(g, r, 30 + i * 110 + Math.floor(r() * 30), 262, 70 + Math.floor(r() * 30));
    for (let sx = 0; sx < W; sx += 4) {
      g.fillStyle(0xe4e8eb).fillRect(sx, 262 - (2 + Math.floor(r() * 5)), 4, 6);
    }
  });
  return [layer(scene, far, 0.1), layer(scene, mid, 0.4), layer(scene, roadMud(scene), 1)];
}

function backdropTrack(scene) {
  const far = tex(scene, 'sc_trk_far', W, H, (g, r) => {
    sky(g, [0x9fb4c8, 0xabbecf, 0xb8c8d6, 0xc5d1db, 0xd0d8de]);
    panels(g, r, {
      y: 186,
      minH: 26,
      maxH: 50,
      wall: 0xa7b0b9,
      base: 0x96a0aa,
      win: 0x8b95a0,
      lit: 0.05,
    });
    // Лес на горизонте.
    for (let x = 0; x < W; x += 3)
      g.fillStyle(0x56604f).fillRect(x, 182 - Math.floor(r() * 10), 3, 30);
  });
  const mid = tex(scene, 'sc_trk_mid', W, H, (g, r) => {
    // Трибуна: ступени, зрители точками, навес, флаги и баннер.
    g.fillStyle(0x60666e).fillRect(0, 186, W, 70);
    for (let y = 192; y < 252; y += 8) {
      g.fillStyle(0x777e86).fillRect(0, y, W, 2);
      for (let x = 2; x < W; x += 4)
        if (r() < 0.55)
          g.fillStyle(
            [0xc94a3a, 0x3a5fa8, 0xe2d24c, 0xe6e2da, 0x3b7a4a, 0x2a2a2a][Math.floor(r() * 6)],
          ).fillRect(x, y - 4, 2, 4);
    }
    g.fillStyle(0x3d434a).fillRect(0, 176, W, 10);
    for (let x = 20; x < W; x += 80) g.fillStyle(0x3d434a).fillRect(x, 176, 3, 80);
    // Баннер вдоль трибуны.
    for (let x = 0; x < W; x += 320) {
      g.fillStyle(0x1f4fa0).fillRect(x + 40, 236, 240, 16);
      g.fillStyle(0xffffff).fillRect(x + 40, 236, 240, 2);
      g.fillStyle(0xd23a2a).fillRect(x + 40, 250, 240, 2);
    }
    // Флаги на мачтах.
    for (let x = 60; x < W; x += 160) {
      g.fillStyle(0xcfd3d6).fillRect(x, 140, 2, 46);
      g.fillStyle(0xffffff).fillRect(x + 2, 142, 14, 3);
      g.fillStyle(0x2f5fb4).fillRect(x + 2, 145, 14, 3);
      g.fillStyle(0xd23a2a).fillRect(x + 2, 148, 14, 3);
    }
    // Стена из покрышек: красно-белые столбики.
    for (let x = 0; x < W; x += 10) {
      const red = (x / 10) % 2 === 0;
      for (let y = 254; y < 264; y += 3)
        g.fillStyle(red ? 0xc23b30 : 0xe8e8e2).fillRect(x, y, 9, 2);
      g.fillStyle(0x1b1b1d).fillRect(x, 263, 9, 1);
    }
  });
  return [layer(scene, far, 0.1), layer(scene, mid, 0.4), layer(scene, roadAsphalt(scene), 1)];
}

function backdropFree(scene) {
  const far = tex(scene, 'sc_free_far', W, H, (g, r) => {
    sky(g, [0xc3c9cf, 0xccd1d5, 0xd5d8da, 0xdcdedd, 0xe1e1dd]);
    // Лес полосой, храм с золотым куполом, ЛЭП.
    for (let x = 0; x < W; x += 2)
      g.fillStyle(0x4f5a49).fillRect(x, 190 - Math.floor(r() * 14), 2, 40);
    const cx = 420;
    g.fillStyle(0xe6e1d4).fillRect(cx, 160, 26, 36);
    g.fillStyle(0xe6e1d4).fillRect(cx + 8, 146, 10, 16);
    g.fillStyle(0xd9a93a).fillRect(cx + 7, 138, 12, 9);
    g.fillStyle(0xd9a93a).fillRect(cx + 9, 134, 8, 4);
    g.fillStyle(0xd9a93a).fillRect(cx + 12, 126, 2, 8);
    g.fillStyle(0xd9a93a).fillRect(cx + 10, 128, 6, 1);
    for (const x of [60, 260, 520]) powerLine(g, x, 214, 76, 0x5d636a);
    wires(g, 146, 0x5d636a);
    g.fillStyle(0x8c8a6c).fillRect(0, 210, W, 30); // жухлое поле
    for (let i = 0; i < 160; i++)
      g.fillStyle(0x7a7856).fillRect(Math.floor(r() * W), 212 + Math.floor(r() * 26), 3, 1);
  });
  const mid = tex(scene, 'sc_free_mid', W, H, (g, r) => {
    // Обочина: деревянный забор, берёзы, кусты, снег пятнами.
    g.fillStyle(0x7d7a5c).fillRect(0, 236, W, 30);
    for (let x = 0; x < W; x += 12) {
      g.fillStyle(0x6b5a44).fillRect(x, 226, 3, 32);
      g.fillStyle(0x5c4c39).fillRect(x, 232, 12, 2);
      g.fillStyle(0x5c4c39).fillRect(x, 244, 12, 2);
    }
    for (let i = 0; i < 5; i++)
      birch(g, r, 50 + i * 130 + Math.floor(r() * 40), 258, 80 + Math.floor(r() * 30));
    for (let i = 0; i < 40; i++)
      g.fillStyle(0xe6e9ec).fillRect(Math.floor(r() * W), 254 + Math.floor(r() * 8), 4, 2);
  });
  return [layer(scene, far, 0.1), layer(scene, mid, 0.45), layer(scene, roadMud(scene), 1)];
}

function layer(scene, key, k) {
  return { key, k };
}

/** Раскисшая грунтовка: колеи, лужи с отражением неба, комья, снег по кромке. */
function roadMud(scene) {
  return tex(scene, 'sc_road_mud', W, H, (g, r) => {
    [0x5f4a35, 0x584430, 0x513e2b, 0x4a3827].forEach((c, i) =>
      g.fillStyle(c).fillRect(0, 263 + i * 24, W, 25),
    );
    for (const y of [284, 304, 324])
      for (let x = 0; x < W; x += 2)
        if (r() < 0.8) g.fillStyle(0x3b2d1f).fillRect(x, y + Math.floor(r() * 2), 2, 2);
    for (let i = 0; i < 6; i++) {
      const px = Math.floor(r() * W);
      const py = 290 + Math.floor(r() * 50);
      const w = 24 + Math.floor(r() * 30);
      g.fillStyle(0x3b2d1f).fillEllipse(px, py + 1, w + 4, 8);
      g.fillStyle(0x8f9ba6).fillEllipse(px, py, w, 6);
    }
    for (let i = 0; i < 220; i++)
      g.fillStyle(r() < 0.5 ? 0x6e5840 : 0x433323).fillRect(
        Math.floor(r() * W),
        266 + Math.floor(r() * 94),
        2,
        1,
      );
    for (let x = 0; x < W; x += 5)
      g.fillStyle(0xcfd5d8).fillRect(x, 263, 5, 1 + Math.floor(r() * 3));
  });
}

/** Асфальт автодрома: тёмный, трещины, белая кромка, красно-белый поребрик сверху. */
function roadAsphalt(scene) {
  return tex(scene, 'sc_road_asphalt', W, H, (g, r) => {
    g.fillStyle(0x3d3f44).fillRect(0, 266, W, 94);
    for (let i = 0; i < 260; i++)
      g.fillStyle(r() < 0.5 ? 0x45474d : 0x35373b).fillRect(
        Math.floor(r() * W),
        268 + Math.floor(r() * 90),
        2,
        1,
      );
    for (let x = 0; x < W; x += 16) {
      g.fillStyle((x / 16) % 2 ? 0xe8e8e2 : 0xc23b30).fillRect(x, 263, 16, 4);
    }
    g.fillStyle(0xe8e8e2).fillRect(0, 272, W, 2);
    g.fillStyle(0xe8e8e2).fillRect(0, 352, W, 2);
    for (let x = 0; x < W; x += 40) g.fillStyle(0xd6d6cf).fillRect(x, 312, 20, 2);
  });
}

// ---------- Объекты на трассе (в метрах трассы) ----------

const PROPS = {
  tires: (g) => {
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x16171a).fillRect(i * 2, 22 - i * 7 - 7, 22, 7);
      g.fillStyle(0x2b2d31).fillRect(i * 2 + 2, 22 - i * 7 - 6, 18, 2);
      g.fillStyle(0x0b0b0c).fillRect(i * 2 + 8, 22 - i * 7 - 5, 6, 3);
    }
  },
  wreck: (g) => {
    // Брошенная «копейка» без колёс на кирпичах: ржавый седан.
    g.fillStyle(0x6e7b6a).fillRect(4, 10, 64, 12);
    g.fillStyle(0x6e7b6a).fillRect(18, 2, 32, 9);
    g.fillStyle(0x2c3640).fillRect(21, 4, 12, 6);
    g.fillStyle(0x2c3640).fillRect(35, 4, 12, 6);
    g.fillStyle(0x8a4a2a).fillRect(8, 18, 20, 3);
    g.fillStyle(0x8a4a2a).fillRect(44, 16, 14, 3);
    g.fillStyle(0xd8d2c0).fillRect(66, 13, 3, 3);
    g.fillStyle(0x9a4a32).fillRect(12, 22, 8, 4);
    g.fillStyle(0x9a4a32).fillRect(52, 22, 8, 4);
  },
  crows: (g) => {
    for (const [x, y] of [
      [0, 4],
      [9, 0],
      [17, 5],
    ]) {
      g.fillStyle(0x151517).fillRect(x, y, 5, 3);
      g.fillRect(x + 4, y - 1, 2, 2);
      g.fillStyle(0x3a3a2a).fillRect(x + 6, y - 1, 1, 1);
    }
  },
  cone: (g) => {
    g.fillStyle(0xe7652a).fillRect(3, 0, 2, 2);
    g.fillStyle(0xe7652a).fillRect(2, 2, 4, 3);
    g.fillStyle(0xf2f2ec).fillRect(2, 5, 4, 2);
    g.fillStyle(0xe7652a).fillRect(1, 7, 6, 3);
    g.fillStyle(0x1b1b1d).fillRect(0, 10, 8, 2);
  },
  busstop: (g) => {
    // Остановка: бетонный навес с синей табличкой.
    g.fillStyle(0x8f9398).fillRect(0, 0, 60, 4);
    g.fillStyle(0x6f7378).fillRect(2, 4, 3, 30);
    g.fillStyle(0x6f7378).fillRect(55, 4, 3, 30);
    g.fillStyle(0x9fb3c0, 0.6).fillRect(5, 6, 50, 20);
    g.fillStyle(0x5c4c39).fillRect(10, 24, 40, 3);
    g.fillStyle(0x2f5fb4).fillRect(62, 0, 14, 10);
    g.fillStyle(0xffffff).fillRect(64, 3, 10, 1);
    g.fillStyle(0xffffff).fillRect(64, 6, 7, 1);
    g.fillStyle(0x6f7378).fillRect(68, 10, 2, 24);
  },
  gazelle: (g) => {
    // «Газель»: белая кабина и тентованный кузов.
    g.fillStyle(0x6a7a52).fillRect(0, 0, 44, 22);
    g.fillStyle(0x5b6a46).fillRect(0, 0, 44, 2);
    g.fillStyle(0xe8e6de).fillRect(44, 6, 20, 16);
    g.fillStyle(0x34424e).fillRect(50, 8, 12, 7);
    g.fillStyle(0xd9d6cc).fillRect(62, 16, 4, 6);
    g.fillStyle(0x16171a).fillRect(8, 20, 10, 8);
    g.fillStyle(0x16171a).fillRect(48, 20, 10, 8);
    g.fillStyle(0x8d9096).fillRect(11, 23, 4, 3);
    g.fillStyle(0x8d9096).fillRect(51, 23, 4, 3);
  },
  roadsign: (g) => {
    // Синий указатель: «Москва 712».
    g.fillStyle(0x2f5fb4).fillRect(0, 0, 40, 18);
    g.fillStyle(0xffffff).fillRect(1, 1, 38, 1);
    g.fillStyle(0xffffff).fillRect(1, 16, 38, 1);
    g.fillStyle(0xffffff).fillRect(4, 5, 18, 2);
    g.fillStyle(0xffffff).fillRect(28, 5, 8, 2);
    g.fillStyle(0xffffff).fillRect(4, 10, 14, 2);
    g.fillStyle(0x6f7378).fillRect(18, 18, 3, 26);
  },
  kmpost: (g) => {
    g.fillStyle(0xf0eee8).fillRect(0, 0, 6, 16);
    g.fillStyle(0x1b1b1d).fillRect(0, 0, 6, 3);
    g.fillStyle(0x1b1b1d).fillRect(1, 6, 4, 1);
  },
  board: (g) => {
    // Табличка расстояния на автодроме.
    g.fillStyle(0xf0eee8).fillRect(0, 0, 16, 12);
    g.fillStyle(0x1b1b1d).fillRect(0, 0, 16, 1);
    g.fillStyle(0x1b1b1d).fillRect(3, 4, 10, 4);
    g.fillStyle(0x6f7378).fillRect(7, 12, 2, 20);
  },
};

const PROP_SIZE = {
  tires: [26, 24],
  wreck: [72, 28],
  crows: [24, 8],
  cone: [8, 12],
  busstop: [78, 34],
  gazelle: [66, 28],
  roadsign: [40, 44],
  kmpost: [6, 16],
  board: [16, 32],
};

/** Картинка объекта (текстура создаётся один раз). */
export function prop(scene, name) {
  const [w, h] = PROP_SIZE[name];
  return tex(scene, `prop_${name}`, w, h, PROPS[name]);
}

/** Объекты у дороги по теме: [метр, имя, y низа]. Позади дороги — y 262, перед — y 300+. */
export function roadsideProps(theme, length) {
  const list = [];
  if (theme === 'mud') {
    for (let m = 12; m < length; m += 46)
      list.push([m, ['tires', 'wreck', 'crows'][list.length % 3], 262]);
  } else if (theme === 'free') {
    list.push(
      [60, 'busstop', 262],
      [180, 'roadsign', 262],
      [330, 'gazelle', 262],
      [450, 'tires', 262],
    );
    for (let m = 0; m < length; m += 100) list.push([m + 5, 'kmpost', 266]);
  } else if (theme === 'track') {
    for (let m = 50; m < length; m += 50) list.push([m, 'board', 262]);
  }
  return list;
}
