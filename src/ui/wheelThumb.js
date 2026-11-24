/**
 * Картинка колеса для карточки детали: тормозной диск, суппорт, шина и диск — те же пиксельные листы,
 * что на машине (первый кадр), диск перекрашен в цвет дисков игрока.
 */
import Phaser from 'phaser';

/**
 * @param {Phaser.Scene} scene
 * @param {{disc: string, caliper: string, tire: string, rim: string}} keys
 * @param {string|null} rimHex
 * @param {string|null} caliperHex
 * @param {number} size сторона в пикселях вёрстки
 */
export function wheelThumb(scene, keys, rimHex, size = 96, caliperHex = null) {
  const canvas = document.createElement('canvas');
  canvas.className = 'wheel-thumb';
  canvas.width = size * 2;
  canvas.height = size * 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  const draw = (key, tint) => {
    if (!scene.textures.exists(key)) return;
    const f = scene.textures.getFrame(key, 0);
    const img = f.source.image;
    if (!tint) {
      ctx.drawImage(
        img,
        f.cutX,
        f.cutY,
        f.cutWidth,
        f.cutHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return;
    }
    // Цвет диска: умножение на свой цвет внутри силуэта диска.
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const c = tmp.getContext('2d');
    c.drawImage(img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, tmp.width, tmp.height);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint;
    c.fillRect(0, 0, tmp.width, tmp.height);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, tmp.width, tmp.height);
    ctx.drawImage(tmp, 0, 0);
  };
  draw(keys.disc);
  draw(keys.caliper, caliperHex ?? '#c4282e');
  draw(keys.tire);
  draw(keys.rim, rimHex ?? Phaser.Display.Color.IntegerToColor(0xc0c4c8).rgba);
  return canvas;
}
