/** Мягкая тень кузова и более плотный контакт шин с покрытием. */
export function groundShadow(scene, width, axles) {
  const key = 'vehicle_ground_shadow';
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, 64, 32);
    const ctx = texture.getContext();
    ctx.scale(32, 16);
    const gradient = ctx.createRadialGradient(1, 1, 0, 1, 1, 1);
    gradient.addColorStop(0, 'rgba(12,10,9,0.96)');
    gradient.addColorStop(0.4, 'rgba(12,10,9,0.65)');
    gradient.addColorStop(1, 'rgba(12,10,9,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 2);
    texture.refresh();
  }
  const shadow = (x, y, w, h, alpha) =>
    scene.add.image(x, y, key).setDisplaySize(w, h).setAlpha(alpha);
  return scene.add.container(0, 0, [
    shadow(0, 0, width * 1.12, 33, 0.65),
    shadow(0, -1, width * 0.95, 15, 0.66),
    ...axles.map((x) => shadow(x, 1, 47, 12, 0.95)),
  ]);
}
