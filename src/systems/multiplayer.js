import parts from '../../data/parts.json';
import { validNickname } from '../../server/duel-rules.js';

const endpoint = import.meta.env.VITE_MULTIPLAYER_URL || (import.meta.env.DEV ? '/lobby' : '');
export const hasLobbyEndpoint = Boolean(endpoint);
const key = 'dedov-garage:multiplayer-nick';
let nickname = '';

export const duelBuild = Object.freeze({
  ...parts.initialBuild,
  tires: 'tires_sport',
  engine: 'engine_tuned',
  gearbox: 'gearbox_close',
});
export const duelCondition = Object.freeze({ dirty: false, oil: 'fresh', damage: 0 });

export function getNickname() {
  try {
    return localStorage.getItem(key) ?? nickname;
  } catch {
    return nickname;
  }
}

export function setNickname(value) {
  if (!validNickname(value)) return false;
  nickname = value.normalize('NFKC').trim();
  try {
    localStorage.setItem(key, nickname);
  } catch {
    // При недоступном хранилище ник сохраняется до перезагрузки.
  }
  return true;
}

export async function lobbyRequest(body, token, { keepalive = false } = {}) {
  if (!endpoint) throw new Error('Тестовое лобби пока не подключено к этой сборке.');
  const started = performance.now();
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(body),
      keepalive,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new Error('Нет связи с лобби. Попробуй ещё раз.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !Number.isFinite(result.now)) {
    const error = new Error(result.error ?? 'Лобби недоступно.');
    error.status = response.status;
    throw error;
  }
  const received = performance.now();
  result.roundTrip = received - started;
  result.clockOffset = result.now - (started + received) / 2;
  return result;
}

export function leaveLobby(token) {
  if (token) void lobbyRequest({ action: 'leave' }, token, { keepalive: true }).catch(() => {});
}
