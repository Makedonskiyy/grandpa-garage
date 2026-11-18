/**
 * Окно настроек (ТЗ 3.4): слева экран и игра, справа звук. Всё применяется сразу
 * и сохраняется в localStorage (src/systems/settings.js).
 */
import { el } from './dom.js';
import { segmented, slider, toggle } from './components.js';
import { openModal } from './overlay.js';
import {
  getSettings,
  updateSettings,
  SCALE_MODES,
  TEXT_SPEEDS,
  GEARBOX_MODES,
} from '../systems/settings.js';
import { canFullscreen } from '../systems/scale.js';
import { t } from '../systems/strings.js';

/**
 * Строка настройки: подпись (и пояснение) слева, контрол справа;
 * stack — контрол под подписью на всю ширину (сегменты).
 */
const row = (label, control, hint, stack = false) =>
  el('div', { class: stack ? 'setting setting--stack' : 'setting' }, [
    el('div', { class: 'setting__label' }, [
      el('div', { text: label }),
      hint ? el('div', { class: 'setting__hint', text: hint }) : null,
    ]),
    control,
  ]);

const section = (title, rows) =>
  el('section', { class: 'settings__section' }, [
    el('h3', { class: 'modal__section', text: title }),
    ...rows,
  ]);

export function openSettings() {
  return openModal(
    () => {
      const s = getSettings();
      // Режим экрана — по факту: игрок мог выйти из полного экрана сам.
      const display = document.fullscreenElement ? 'fullscreen' : 'window';
      const screen = [
        canFullscreen()
          ? row(
              t('settings.display'),
              segmented(
                ['fullscreen', 'window'].map((v) => ({
                  value: v,
                  label: t(`settings.displayOptions.${v}`),
                })),
                display,
                (v) => updateSettings({ display: v }),
                { label: t('settings.display') },
              ),
              null,
              true,
            )
          : null,
        row(
          t('settings.scale'),
          segmented(
            SCALE_MODES.map((v) => ({ value: v, label: t(`settings.scaleOptions.${v}`) })),
            s.scale,
            (v) => updateSettings({ scale: v }),
            { label: t('settings.scale') },
          ),
          t('settings.scaleHint'),
          true,
        ),
      ];
      const sound = [
        row(
          t('settings.music'),
          slider(s.music, (v) => updateSettings({ music: v }), { label: t('settings.music') }),
        ),
        row(
          t('settings.sfx'),
          slider(s.sfx, (v) => updateSettings({ sfx: v }), { label: t('settings.sfx') }),
        ),
        row(
          t('settings.mute'),
          toggle(s.muted, (v) => updateSettings({ muted: v }), { label: t('settings.mute') }),
        ),
      ];
      const game = [
        row(
          t('settings.gearbox'),
          segmented(
            GEARBOX_MODES.map((v) => ({ value: v, label: t(`settings.gearboxOptions.${v}`) })),
            s.gearbox,
            (v) => updateSettings({ gearbox: v }),
            { label: t('settings.gearbox') },
          ),
          t('settings.gearboxHint'),
          true,
        ),
        row(
          t('settings.textSpeed'),
          segmented(
            TEXT_SPEEDS.map((v) => ({ value: v, label: t(`settings.textSpeedOptions.${v}`) })),
            s.textSpeed,
            (v) => updateSettings({ textSpeed: v }),
            { label: t('settings.textSpeed') },
          ),
          null,
          true,
        ),
        row(
          t('settings.shake'),
          toggle(s.shake, (v) => updateSettings({ shake: v }), { label: t('settings.shake') }),
          t('settings.shakeHint'),
        ),
      ];
      return [
        el('div', { class: 'settings' }, [
          el('div', { class: 'settings__col' }, [
            section(t('settings.sections.screen'), screen),
            section(t('settings.sections.game'), game),
          ]),
          el('div', { class: 'settings__col' }, [section(t('settings.sections.sound'), sound)]),
        ]),
      ];
    },
    { id: 'settings', title: t('settings.title') },
  );
}
