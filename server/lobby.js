import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DUEL_COUNTDOWN_MS, DUEL_DISTANCE, DUEL_SECONDS, validNickname } from './duel-rules.js';

export function createLobby({ origin = '', now = Date.now } = {}) {
  const players = new Map();
  const invites = new Map();
  const races = new Map();

  function leave(player) {
    players.delete(player.token);
    for (const [id, invite] of invites) {
      if (invite.from === player || invite.to === player) invites.delete(id);
    }
    const race = player.race;
    if (race && !race.result) {
      const other = race.players.find((entry) => entry !== player);
      race.result = { winner: other.id, reason: 'left' };
    }
  }

  function clean(time) {
    for (const player of players.values()) {
      if (time - player.seen > 12000) leave(player);
    }
    for (const [id, invite] of invites) {
      if (invite.until <= time) invites.delete(id);
    }
    for (const [id, race] of races) {
      if (!race.result) {
        if (race.startAt === null && time >= race.readyUntil) {
          race.result = { winner: null, reason: 'not_ready' };
        } else if (race.startAt !== null && time >= race.startAt + (DUEL_SECONDS + 6) * 1000) {
          settle(race, true);
        }
      }
      if (time >= (race.startAt ?? race.readyUntil) + 120000) {
        for (const player of race.players) if (player.race === race) player.race = null;
        races.delete(id);
      }
    }
  }

  function settle(race, expired = false) {
    const [a, b] = race.players;
    const first = race.states[a.id];
    const second = race.states[b.id];
    if (!expired && (!first?.done || !second?.done)) return;
    const score = (state) => (state?.done === 'finish' ? state.elapsed : Infinity);
    const one = score(first);
    const two = score(second);
    race.result = { winner: one === two ? null : one < two ? a.id : b.id, reason: 'finish' };
  }

  function snapshot(player, time) {
    const race = player.race;
    const other = race?.players.find((entry) => entry !== player);
    const invite = [...invites.values()].find((item) => item.from === player || item.to === player);
    return {
      now: time,
      id: player.id,
      players: [...players.values()].map(({ id, nick, race }) => ({
        id,
        nick,
        busy: Boolean(race),
      })),
      invite: invite && {
        id: invite.id,
        incoming: invite.to === player,
        nick: (invite.to === player ? invite.from : invite.to).nick,
      },
      notice: player.notice,
      race: race && {
        id: race.id,
        startAt: race.startAt,
        rival: other.nick,
        peer: race.states[other.id],
        own: race.states[player.id],
        result: race.result,
      },
    };
  }

  function act(player, body, time) {
    const { action, id } = body;
    if (action === 'leave') return leave(player);
    if (action === 'invite') {
      const target = [...players.values()].find((entry) => entry.id === id);
      if (!target || target === player || player.race || target.race) return 'Игрок недоступен';
      if (
        [...invites.values()].some(({ from, to }) =>
          [from, to].some((entry) => entry === player || entry === target),
        )
      )
        return 'Уже есть приглашение';
      player.notice = null;
      const inviteId = randomUUID();
      invites.set(inviteId, { id: inviteId, from: player, to: target, until: time + 20000 });
      return;
    }
    if (action === 'accept' || action === 'decline') {
      const invite = invites.get(id);
      if (!invite || invite.to !== player) return 'Приглашение истекло';
      invites.delete(id);
      if (action === 'decline') {
        invite.from.notice = 'Приглашение отклонено';
        return;
      }
      const race = {
        id: randomUUID(),
        players: [invite.from, player],
        readyUntil: time + 20000,
        ready: new Set(),
        startAt: null,
        states: {},
        result: null,
      };
      for (const entry of race.players) entry.race = race;
      races.set(race.id, race);
      return;
    }
    const race = player.race;
    if (!race || race.id !== id || race.result) return;
    if (action === 'ready') {
      race.ready.add(player.id);
      if (race.ready.size === 2 && race.startAt === null) {
        race.startAt = time + DUEL_COUNTDOWN_MS + 1500;
      }
      return;
    }
    const previous = race.states[player.id];
    if (action !== 'tick' || !body.state || race.startAt === null || previous?.done) return;
    const { distance, elapsed, done, sequence } = body.state;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) return 'Неверный номер обновления';
    if (sequence <= (previous?.sequence ?? 0)) return;
    if (
      !Number.isFinite(distance) ||
      !Number.isFinite(elapsed) ||
      distance < 0 ||
      distance > DUEL_DISTANCE + 2 ||
      elapsed < 0 ||
      elapsed > DUEL_SECONDS + 1 ||
      elapsed > Math.max(0, (time - race.startAt) / 1000) + 1 ||
      (time < race.startAt && (distance > 0 || elapsed > 0 || done === 'finish')) ||
      (done && !['finish', 'dnf'].includes(done)) ||
      (done === 'finish' && distance < DUEL_DISTANCE)
    )
      return 'Неверное состояние заезда';
    if (distance < (previous?.distance ?? 0) || elapsed < (previous?.elapsed ?? 0)) return;
    race.states[player.id] = { distance, elapsed, sequence, done: done || null };
    settle(race);
  }

  return createServer(async (req, res) => {
    const requestOrigin = req.headers.origin;
    if (
      requestOrigin &&
      (requestOrigin === origin ||
        (!origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin)))
    ) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      });
      return res.end();
    }
    function send(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    }
    if (req.method !== 'POST' || req.url !== '/lobby') return send(404, {});
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 2048) return send(413, {});
      }
      const body = JSON.parse(raw);
      const time = now();
      clean(time);
      if (body?.action === 'join') {
        if (!validNickname(body.nick)) return send(400, { error: 'Выбери другой ник' });
        if (players.size >= 100) return send(503, { error: 'Лобби заполнено' });
        const nick = body.nick.normalize('NFKC').trim();
        if (
          [...players.values()].some((player) => player.nick.toLowerCase() === nick.toLowerCase())
        ) {
          return send(409, { error: 'Этот ник уже занят' });
        }
        const player = { id: randomUUID(), token: randomUUID(), nick, seen: time };
        players.set(player.token, player);
        return send(200, { token: player.token, ...snapshot(player, time) });
      }
      const player = players.get(req.headers.authorization?.slice(7));
      if (!player) return send(401, { error: 'Сессия истекла. Войди снова.' });
      player.seen = time;
      const error = act(player, body, time);
      if (error) return send(409, { error });
      return send(200, snapshot(player, time));
    } catch {
      if (!res.headersSent && !res.destroyed) send(400, { error: 'Неверный запрос' });
    }
  });
}
