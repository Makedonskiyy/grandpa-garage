import Phaser from 'phaser';
import manifest from '../../data/assets.json';
import config from '../../data/config.json';
import { BaseScene } from './BaseScene.js';
import { SCENES } from '../config/constants.js';
import { el } from '../ui/dom.js';
import { webButton } from '../ui/components.js';
import { t } from '../systems/strings.js';
import { preloadCar } from '../systems/CarRig.js';
import { preloadStartLight } from '../systems/StartLight.js';
import { preloadSounds } from '../systems/AudioManager.js';
import { getSettings, updateSettings } from '../systems/settings.js';
import { canFullscreen, setFullscreen } from '../systems/scale.js';

const RING_R = 66; // радиус кольца загрузки в единицах SVG 144×144
const RING_LEN = 2 * Math.PI * RING_R;
const CREDIT_FONT = '"Cormorant Garamond"';
const LOADER_FONT = '"Inter Variable"';
const SPLASH_WAIT_MS = 4000; // дольше картинки не ждём — заставка идёт как есть

/**
 * Boot (ТЗ 3.2, 7.3) — заставка и загрузка по макету.
 *   1. Через секунду на чёрном плавно появляется логотип, следом снизу поднимается
 *      тёплое свечение (размытый эллипс цвета ушанки); затем оба так же плавно гаснут.
 *   2. «Сделано командой TRITON / Для AI GAME JAM» — отдельным шрифтом.
 *   3. Кольцо загрузки и «Загрузка файлов игры… 64%» — по событию progress загрузчика.
 *   4. Старт. Первый запуск: «Играть на весь экран?» — ответ запоминается в настройках.
 *      Дальше — «Нажмите, чтобы начать» и выбранный режим. Клик здесь — жест пользователя:
 *      браузер разрешает звук и полный экран.
 * Файлы грузятся с самого начала, заставка идёт параллельно; клик по заставке пропускает её.
 */
export class BootScene extends BaseScene {
  constructor() {
    super(SCENES.BOOT);
  }

  preload() {
    this.loaded = false;
    this.timers = [];
    this.#build();
    this.load.on(Phaser.Loader.Events.PROGRESS, (p) => this.#setProgress(p));
    this.#queueManifest();
    // Шрифты подписи и строки загрузки — сразу в фоне: подпись появится через несколько
    // секунд, к этому времени они уже придут.
    document.fonts?.load(`500 72px ${CREDIT_FONT}`);
    document.fonts?.load(`400 34px ${LOADER_FONT}`);
    // Заставка стартует, когда логотип и свечение уже загружены (index.html грузит их первыми),
    // иначе на медленной сети свечение появилось бы без логотипа.
    const images = [...this.$root.querySelectorAll('img')].map((img) => img.decode());
    const timeout = new Promise((r) => setTimeout(r, SPLASH_WAIT_MS));
    Promise.race([Promise.allSettled(images), timeout]).then(() => this.#playSplash());
  }

  create() {
    this.enter();
    this.loaded = true;
    this.#setProgress(1);
    if (this.stage === 'loader') this.#finishLoading();
  }

  // ---------- Разметка ----------

  #build() {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 144 144');
    ring.setAttribute('class', 'boot__ring');
    ring.innerHTML = `
      <circle class="boot__ring-track" cx="72" cy="72" r="${RING_R}"/>
      <circle class="boot__ring-arc" cx="72" cy="72" r="${RING_R}"
        stroke-dasharray="${RING_LEN}" stroke-dashoffset="${RING_LEN}"/>`;
    this.$arc = ring.querySelector('.boot__ring-arc');
    this.$percent = el('span', { class: 'boot__percent', text: '0%' });
    this.$start = el('div', { class: 'boot__start' });

    this.$root = el('div', { class: 'ui-abs boot', 'data-stage': 'dark' }, [
      el('img', {
        class: 'boot__glow',
        src: 'assets/images/ui/glow.svg',
        alt: '',
        fetchpriority: 'high',
      }),
      el('img', {
        class: 'boot__logo',
        src: 'assets/images/ui/logo.svg',
        fetchpriority: 'high',
        alt: t('menu.title'),
        draggable: 'false',
      }),
      el('div', { class: 'boot__credit' }, [
        el('div', { class: 'boot__credit-title', text: t('boot.credits') }),
        el('div', { class: 'boot__credit-sub', text: t('boot.event') }),
      ]),
      el('div', { class: 'boot__loader', role: 'progressbar' }, [
        ring,
        el('div', { class: 'boot__status' }, [`${t('boot.loading')} `, this.$percent]),
      ]),
      this.$start,
    ]);
    // Длительности переходов — из data/config.json, чтобы CSS и таймеры шли в такт.
    const b = config.boot;
    for (const [name, ms] of [
      ['--boot-in', b.logoInMs],
      ['--boot-out', b.logoOutMs],
      ['--boot-credit-in', b.creditInMs],
      ['--boot-credit-out', b.creditOutMs],
    ])
      this.$root.style.setProperty(name, `${ms}ms`);
    this.ui.append(this.$root);
  }

  #setProgress(p) {
    this.$arc.setAttribute('stroke-dashoffset', String(RING_LEN * (1 - p)));
    this.$percent.textContent = `${Math.round(p * 100)}%`;
  }

  #queueManifest() {
    for (const a of manifest.images) this.load.image(a.key, a.path);
    for (const a of manifest.spritesheets) this.load.spritesheet(a.key, a.path, a.frame);
    for (const a of manifest.audio) this.load.audio(a.key, [].concat(a.path));
    preloadSounds(this); // звуки из src/assets/audio — только те, что уже есть
    preloadCar(this); // слои машины игрока: список берётся из data/car.json
    preloadStartLight(this); // стартовый светофор обкатки и заезда
  }

  // ---------- Заставка ----------

  #setStage(stage) {
    this.stage = stage;
    this.$root.dataset.stage = stage;
  }

  /** Шаги заставки по таймеру страницы: во время загрузки часы сцены ещё не идут. */
  #playSplash() {
    const b = config.boot;
    const steps = [
      [b.delayMs, 'logo'],
      [b.logoInMs + b.logoHoldMs, 'logo-out'],
      [b.logoOutMs, 'credit'],
      [b.creditInMs + b.creditHoldMs, 'credit-out'],
      [b.creditOutMs, 'loader'],
    ];
    let at = 0;
    for (const [wait, stage] of steps) {
      at += wait;
      this.timers.push(setTimeout(() => this.#enter(stage), at));
    }
    // Клик или клавиша во время заставки — сразу к загрузке.
    this.skip = (e) => {
      if (this.stage === 'start' || this.stage === 'loader') return;
      e.preventDefault?.();
      this.#enter('loader');
    };
    window.addEventListener('pointerdown', this.skip);
    window.addEventListener('keydown', this.skip);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.#cleanup());
  }

  #enter(stage) {
    if (this.stage === 'loader' || this.stage === 'start') return;
    this.#setStage(stage);
    if (stage !== 'loader') return;
    for (const id of this.timers) clearTimeout(id);
    this.loaderShownAt = performance.now();
    if (this.loaded) this.#finishLoading();
  }

  /** Кольцо держится хотя бы loaderMinMs, чтобы не мелькнуть, затем — старт. */
  #finishLoading() {
    const wait = Math.max(0, config.boot.loaderMinMs - (performance.now() - this.loaderShownAt));
    this.timers.push(setTimeout(() => this.#showStart(), wait));
  }

  // ---------- Старт ----------

  #showStart() {
    if (this.stage === 'start') return;
    const ask = getSettings().display === 'ask' && canFullscreen() && !document.fullscreenElement;
    this.$start.replaceChildren(...(ask ? this.#question() : this.#pressToStart()));
    this.#setStage('start');
  }

  /** Первый запуск: спросить про полный экран; ответ — это и есть старт игры. */
  #question() {
    const choose = (display) => {
      updateSettings({ display });
      this.#start();
    };
    return [
      el('div', { class: 'boot__question', text: t('boot.fullscreenQuestion') }),
      el('div', { class: 'boot__hint', text: t('boot.fullscreenHint') }),
      el('div', { class: 'boot__choices' }, [
        webButton(t('boot.fullscreen'), () => choose('fullscreen'), {
          variant: 'primary',
          icon: 'fullscreen',
        }),
        webButton(t('boot.window'), () => choose('window'), { variant: 'dark', icon: 'window' }),
      ]),
    ];
  }

  #pressToStart() {
    this.onStart = (e) => {
      if (e.type === 'keydown' && e.key === 'Escape') return;
      this.#start();
    };
    // Слушатели — со следующего кадра, чтобы клик, пропустивший заставку, не стартовал игру.
    requestAnimationFrame(() => {
      window.addEventListener('pointerdown', this.onStart);
      window.addEventListener('keydown', this.onStart);
    });
    return [el('div', { class: 'boot__press', text: t('boot.pressToStart') })];
  }

  #start() {
    if (this.started) return;
    this.started = true;
    this.#cleanup();
    // Жест пользователя: браузер разрешает звук и полный экран.
    if (getSettings().display === 'fullscreen') setFullscreen(true);
    if (this.sound.locked) this.sound.unlock();
    this.goTo(SCENES.MENU);
  }

  #cleanup() {
    for (const id of this.timers) clearTimeout(id);
    window.removeEventListener('pointerdown', this.skip);
    window.removeEventListener('keydown', this.skip);
    window.removeEventListener('pointerdown', this.onStart);
    window.removeEventListener('keydown', this.onStart);
  }
}
