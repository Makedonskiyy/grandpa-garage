/**
 * AudioManager — музыка и звуки (ТЗ 7.5).
 * Одна музыкальная дорожка за раз с плавной сменой; громкость из настроек;
 * звук начинается только после первого клика (экран «Нажмите, чтобы начать»).
 * Если файла ещё нет в кэше — молча пропускаем: каркас работает без ассетов.
 */
import { createEngineVoice } from './engineVoice.js';
import config from '../../data/config.json';
import catalog from '../../data/sounds.json';

/** Громкость каждого звука из каталога (data/sounds.json). */
const BASE = Object.fromEntries(catalog.sounds.map((x) => [x.key, x.volume ?? 1]));

/**
 * Файлы звуков: src/assets/audio/<группа>/<ключ>.mp3. Vite кладёт в сборку только те,
 * что есть, — недостающие звуки просто не играют, без ошибок загрузки.
 */
const FILES = import.meta.glob('../assets/audio/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Ставит все найденные звуки в очередь загрузчика (BootScene). */
export function preloadSounds(scene) {
  for (const [path, url] of Object.entries(FILES)) {
    scene.load.audio(path.split('/').pop().replace(/.mp3$/, ''), url);
  }
}
import { effectiveVolume, onSettingsChange } from './settings.js';

class AudioManager {
  constructor() {
    this.game = null;
    this.music = null;
    this.musicKey = null;
    this.amb = null;
    this.ambKey = null;
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
    this.#fade(this.music, effectiveVolume('music') * (BASE[key] ?? 1));
  }

  stopMusic() {
    if (this.music) {
      const m = this.music;
      this.#fade(m, 0, () => m.destroy());
    }
    this.music = null;
    this.musicKey = null;
  }

  /** Атмосфера под сценой (петля) — отдельный канал, плавная смена; null — тишина. */
  playAmbience(key) {
    if (!this.game || this.ambKey === key) return;
    const old = this.amb;
    this.ambKey = key;
    this.amb = null;
    if (old) this.#fade(old, 0, () => old.destroy());
    if (!key || !this.#has(key)) return;
    this.amb = this.game.sound.add(key, { loop: true, volume: 0 });
    this.amb.play();
    this.#fade(this.amb, effectiveVolume('sfx') * (BASE[key] ?? 1));
  }

  playSfx(key, extra = {}) {
    if (!this.game || !this.#has(key)) return null;
    const volume = effectiveVolume('sfx') * (BASE[key] ?? 1) * (extra.volume ?? 1);
    if (volume <= 0) return null;
    this.game.sound.play(key, { ...extra, volume });
    return true;
  }

  startEngine(build) {
    const sound = this.game?.sound;
    if (!sound?.context || !sound.destination) return null;
    const output = sound.context.createGain();
    const applyLevel = () => {
      output.gain.value = effectiveVolume('sfx');
    };
    applyLevel();
    output.connect(sound.destination);
    let voice = createEngineVoice(sound.context, output, build);
    const unsubscribe = onSettingsChange(applyLevel);
    return {
      update: (run, input) => voice?.update(run, input),
      stop() {
        if (!voice) return;
        unsubscribe();
        voice.stop();
        voice = null;
        output.disconnect();
      },
    };
  }

  /** Зацикленный звук (мотор), громкость и высоту тона меняет вызывающий. */
  loopSfx(key) {
    if (!this.game || !this.#has(key)) return null;
    const s = this.game.sound.add(key, {
      loop: true,
      volume: effectiveVolume('sfx') * (BASE[key] ?? 1),
    });
    s.play();
    return s;
  }

  /** Общая громкость звуков 0–1 (настройки), для петель, которые сцена ведёт сама. */
  sfxLevel() {
    return effectiveVolume('sfx');
  }

  applyVolume() {
    if (this.music) this.music.setVolume(effectiveVolume('music') * (BASE[this.musicKey] ?? 1));
    if (this.amb) this.amb.setVolume(effectiveVolume('sfx') * (BASE[this.ambKey] ?? 1));
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
