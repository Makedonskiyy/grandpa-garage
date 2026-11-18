/**
 * tacho — тахометр для обкатки и заезда.
 *
 * Шкала сегментов до отсечки (последние — красная зона), цифры оборотов, крупная
 * передача и режим коробки. Зелёная полоса над шкалой — где переключаться
 * (или, до старта, на каких оборотах трогаться). На отсечке шкала мигает.
 */
import config from '../../data/config.json';
import { el } from './dom.js';
import { t } from '../systems/strings.js';

export function createTacho({
  segments = config.gearbox.segments,
  redSegments = config.gearbox.redSegments,
} = {}) {
  const bars = Array.from({ length: segments }, (_, i) =>
    el('span', { class: `tacho__seg${i >= segments - redSegments ? ' is-red' : ''}` }),
  );
  const $zone = el('span', { class: 'tacho__zone' });
  const $rpm = el('span', { class: 'tacho-block__rpm', text: '0' });
  const $gear = el('span', { class: 'tacho-block__gear', text: '1' });
  const $mode = el('span', { class: 'tacho-block__mode' });
  const node = el('div', { class: 'tacho-block' }, [
    el('div', { class: 'tacho-block__gearbox' }, [$gear, $mode]),
    el('div', { class: 'tacho-block__main' }, [
      el('div', { class: 'tacho-block__head' }, [
        el('span', { class: 'tacho-block__label', text: t('race.tacho') }),
        el('span', { class: 'tacho-block__readout' }, [
          $rpm,
          el('span', { class: 'tacho-block__unit', text: t('race.rpmUnit') }),
        ]),
      ]),
      el('div', { class: 'tacho' }, [$zone, ...bars]),
    ]),
  ]);

  return {
    node,
    /**
     * @param {{ rpm: number, gear: number, redline: number, zone?: [number, number] | null,
     *   shifting?: boolean, limiter?: boolean, auto?: boolean }} s
     */
    render({
      rpm = 0,
      gear = 1,
      redline,
      zone = null,
      shifting = false,
      limiter = false,
      auto = false,
    }) {
      const lit = Math.max(0, Math.min(segments, Math.round((rpm / redline) * segments)));
      bars.forEach((bar, i) => bar.classList.toggle('is-on', i < lit));
      $rpm.textContent = String(Math.round(rpm / 100) * 100);
      $gear.textContent = shifting ? '·' : String(gear);
      $mode.textContent = auto ? t('race.modeAuto') : t('race.modeManual');
      $zone.hidden = !zone;
      if (zone) {
        $zone.style.left = `${(zone[0] / redline) * 100}%`;
        $zone.style.width = `${((zone[1] - zone[0]) / redline) * 100}%`;
      }
      const inZone = zone && rpm >= zone[0] && rpm <= zone[1];
      node.classList.toggle('is-shift', Boolean(inZone));
      node.classList.toggle('is-limiter', limiter);
      node.classList.toggle('is-shifting', shifting);
    },
  };
}
