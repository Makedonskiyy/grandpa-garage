/**
 * tacho — общий блок тахометра для обкатки и заезда.
 *
 * Полоска сегментов, цифры оборотов и текущая передача. Последние сегменты — красная зона.
 * Во время переключения блок подсвечивает передачу, а автомат на мгновение роняет обороты.
 */
import config from '../../data/config.json';
import { el } from './dom.js';
import { t } from '../systems/strings.js';

export function createTacho({
  compact = false,
  segments = config.gearbox.segments,
  redSegments = config.gearbox.redSegments,
} = {}) {
  const bars = Array.from({ length: segments }, (_, i) =>
    el('span', {
      class: `tacho__seg${i >= segments - redSegments ? ' is-red' : ''}`,
    }),
  );
  const $rpm = el('span', { class: 'tacho-block__rpm', text: '0' });
  const $gear = el('span', {
    class: 'tacho-block__gear',
    text: t('race.gear', { n: 1 }),
  });
  const node = el('div', { class: `tacho-block${compact ? ' tacho-block--compact' : ''}` }, [
    el('div', { class: 'tacho-block__head' }, [
      el('span', { class: 'tacho-block__label', text: t('race.tacho') }),
      el('span', { class: 'tacho-block__readout' }, [
        $rpm,
        el('span', { class: 'tacho-block__unit', text: t('race.rpmUnit') }),
      ]),
    ]),
    el('div', { class: 'tacho' }, bars),
    $gear,
  ]);

  return {
    node,
    render({ rpm = 0, gear = 1, redline = config.gearbox.redlineRpm, shifting = false }) {
      const lit = Math.max(0, Math.min(segments, Math.round((rpm / redline) * segments)));
      bars.forEach((bar, i) => bar.classList.toggle('is-on', i < lit));
      $rpm.textContent = String(Math.round(rpm / 100) * 100);
      $gear.textContent = t('race.gear', { n: gear });
      node.classList.toggle('is-shifting', shifting);
    },
  };
}
