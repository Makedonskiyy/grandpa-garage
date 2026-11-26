export const DUEL_DISTANCE = 400;
export const DUEL_SECONDS = 30;
export const DUEL_COUNTDOWN_MS = 3500;

const blocked = /хуй|хуе|хуё|пизд|ебан|ебла|ёбан|бля|сука|мудак|fuck|shit|bitch|nigg/i;

export function validNickname(value) {
  if (typeof value !== 'string') return false;
  const name = value.normalize('NFKC').trim();
  return /^[а-яёa-z0-9_-]{3,12}$/i.test(name) && !blocked.test(name.replace(/[_-]/g, ''));
}
