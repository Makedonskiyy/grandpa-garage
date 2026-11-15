/**
 * AudioManager — музыка и звуки (ТЗ 7.5).
 * Одна музыкальная дорожка за раз с плавной сменой; громкость из настроек;
 * звук начинается только после первого клика (экран «Нажмите, чтобы начать»).
 * Если файла ещё нет в кэше — молча пропускаем: каркас работает без ассетов.
 */
import config from '../../data/config.json';
import { effectiveVolume, onSettingsChange } from './settings.js';

class AudioManager {
  constructor() {
    this.game = null;
    this.music = null;
    this.musicKey = null;
    this.fades = new Set();
    this.warned = new Set();
  }

  init(game) {
    this.game = game;
    onSettingsChange(() => this.applyVolume());
    game.events.on('step', (_time, delta) => this.#tickFades(delta));
  }

  #has(key) {
    const ok = this.game?.cache.audio.exists(key);
    if (!ok && !this.warned.has(key)) {
      this.warned.add(key);
      if (import.meta.env?.DEV) console.warn(`[audio] нет файла: ${key}`);
    }
    return ok;
  }

  playMusic(key) {
    if (!this.game || this.musicKey === key) return;
    const old = this.music;
    this.musicKey = key;
    this.music = null;
    if (old) this.#fade(old, 0, () => old.destroy());
    if (!this.#has(key)) return;
    this.music = this.game.sound.add(key, { loop: true, volume: 0 });
    this.music.play();
    this.#fade(this.music, effectiveVolume('music'));
  }

  stopMusic() {
    if (this.music) {
      const m = this.music;
      this.#fade(m, 0, () => m.destroy());
    }
    this.music = null;
    this.musicKey = null;
  }

  playSfx(key, extra = {}) {
    if (!this.game || !this.#has(key)) return null;
    const volume = effectiveVolume('sfx') * (extra.volume ?? 1);
    if (volume <= 0) return null;
    this.game.sound.play(key, { ...extra, volume });
    return true;
  }

  /** Зацикленный звук (мотор), громкость и высоту тона меняет вызывающий. */
  loopSfx(key) {
    if (!this.game || !this.#has(key)) return null;
    const s = this.game.sound.add(key, { loop: true, volume: effectiveVolume('sfx') });
    s.play();
    return s;
  }

  applyVolume() {
    if (this.music) this.music.setVolume(effectiveVolume('music'));
  }

  #fade(sound, to, onDone) {
    const from = sound.volume;
    this.fades.add({ sound, from, to, t: 0, onDone });
  }

  #tickFades(delta) {
    const dur = config.audio.musicCrossfadeMs;
    for (const f of this.fades) {
      f.t = Math.min(1, f.t + delta / dur);
      f.sound.setVolume(f.from + (f.to - f.from) * f.t);
      if (f.t >= 1) {
        this.fades.delete(f);
        f.onDone?.();
      }
    }
  }
}

export const audio = new AudioManager();
