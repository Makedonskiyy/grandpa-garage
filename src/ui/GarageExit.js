import { el } from './dom.js';
import { icon } from './icons.js';
import { t } from '../systems/strings.js';

/** Выход из любого заезда, с тем же оформлением, что на объездной. */
export function garageExit(onClick) {
  return el('button', { class: 'ui-abs garage-exit', type: 'button', onclick: onClick }, [
    icon('garage'),
    t('trial.toGarage'),
  ]);
}
