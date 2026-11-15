import Phaser from 'phaser';

// Временная точка входа: проверяем, что Vite + Phaser собираются.
// Полный конфиг со сценами — в следующем коммите.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 640,
  height: 360,
  pixelArt: true,
  backgroundColor: '#000000',
  scene: {
    create() {
      this.add.text(320, 180, 'Дедов гараж', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    },
  },
});
