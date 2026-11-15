/**
 * Окно настроек (ТЗ 3.4): масштаб, музыка, звуки, «Без звука».
 * Всё применяется сразу и сохраняется в localStorage.
 */
import { el } from './dom.js';
import { button } from './components.js';
import { openModal } from './overlay.js';
import { getSettings, updateSettings, SCALE_MODES } from '../systems/settings.js';
import { t } from '../systems/strings.js';

const MODAL_ID = 'settings';

function volumeField(labelKey, key) {
  const s = getSettings();
  const value = el('span', { class: 'accent', text: String(s[key]) });
  const input = el('input', { type: 'range', min: 0, max: 100, step: 5, value: s[key] });
  input.addEventListener('input', () => {
    value.textContent = input.value;
    updateSettings({ [key]: Number(input.value) });
  });
  return el('label', { class: 'field' }, [t(labelKey), input, value]);
}

export function openSettings() {
  return openModal(
    (close) => {
      const s = getSettings();

      const select = el(
        'select',
        {},
        SCALE_MODES.map((m) =>
          el('option', { value: m, selected: s.scale === m }, t(`settings.scaleOptions.${m}`)),
        ),
      );
      select.addEventListener('change', () => updateSettings({ scale: select.value }));

      const mute = el('input', { type: 'checkbox', checked: s.muted });
      mute.addEventListener('change', () => updateSettings({ muted: mute.checked }));

      return [
        el('h2', { text: t('settings.title') }),
        el('label', { class: 'field' }, [t('settings.scale'), select, el('span')]),
        volumeField('settings.music', 'music'),
        volumeField('settings.sfx', 'sfx'),
        el('label', { class: 'field' }, [t('settings.mute'), mute, el('span')]),
        el('div', { class: 'modal__footer' }, button(t('settings.close'), close)),
      ];
    },
    { id: MODAL_ID },
  );
}
