import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLobby } from '../server/lobby.js';

let server;
let now;

beforeEach(() => {
  now = 1000;
  server = createLobby({ now: () => now });
});

function send(body, player) {
  const request = Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url: '/lobby',
    headers: player ? { authorization: 'Bearer ' + player.token } : {},
  });
  return new Promise((resolve) => {
    let status;
    server.emit('request', request, {
      writeHead(code) {
        status = code;
      },
      end(data) {
        resolve({ status, ...JSON.parse(data) });
      },
    });
  });
}

async function invite(from, to) {
  return (await send({ action: 'invite', id: to.id }, from)).invite.id;
}

describe('test multiplayer lobby', () => {
  it('validates nicknames, shows presence and lets the recipient decline', async () => {
    expect((await send({ action: 'join', nick: 'су-ка' })).status).toBe(400);
    const a = await send({ action: 'join', nick: 'Гонщик' });
    expect((await send({ action: 'join', nick: 'гонщик' })).status).toBe(409);
    const b = await send({ action: 'join', nick: 'Pavel' });
    expect(b.players).toHaveLength(2);
    const id = await invite(a, b);
    expect((await send({ action: 'accept', id }, a)).status).toBe(409);
    expect((await send({ action: 'poll' }, b)).invite).toMatchObject({
      incoming: true,
      nick: 'Гонщик',
    });
    await send({ action: 'decline', id }, b);
    expect((await send({ action: 'poll' }, a)).notice).toBe('Приглашение отклонено');
  });

  it('shares a start and chooses by elapsed time, independent of report order', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const invitation = await invite(a, b);
    const accepted = (await send({ action: 'accept', id: invitation }, b)).race;
    const ready = (player) => send({ action: 'ready', id: accepted.id }, player);
    expect((await ready(b)).race.startAt).toBeNull();
    now += 7000;
    expect((await ready(b)).race.startAt).toBeNull();
    const { race } = await ready(a);
    expect(race.startAt).toBe(now + 5000);
    expect((await ready(b)).race.startAt).toBe(race.startAt);
    const tick = (player, state) =>
      send({ action: 'tick', id: race.id, state: { sequence: 1, ...state } }, player);
    expect((await tick(a, { distance: 40, elapsed: 0 })).status).toBe(409);
    now = race.startAt;
    await send({ action: 'poll' }, a);
    await send({ action: 'poll' }, b);
    now += 11000;
    expect((await tick(a, { distance: 400, elapsed: 11, done: 'finish' })).race.result).toBeNull();
    const outcome = await tick(b, { distance: 400, elapsed: 10, done: 'finish' });
    expect(outcome.race.result).toMatchObject({ winner: b.id });
    expect(outcome.race.peer.elapsed).toBe(11);
    expect((await tick(a, { distance: 400, elapsed: 9, done: 'finish' })).race.result.winner).toBe(
      b.id,
    );
  });

  it('keeps the latest progress during reordered requests and final packet retries', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const invitation = await invite(a, b);
    const { race } = await send({ action: 'accept', id: invitation }, b);
    const id = race.id;
    await send({ action: 'ready', id }, a);
    const { startAt } = (await send({ action: 'ready', id }, b)).race;
    now = startAt + 4500;
    const tick = (state) => send({ action: 'tick', id, state }, a);
    await tick({ sequence: 3, distance: 80, elapsed: 4 });
    await tick({ sequence: 2, distance: 60, elapsed: 3 });
    await tick({ sequence: 4, distance: 100, elapsed: 3 });
    expect((await send({ action: 'poll' }, b)).race.peer).toMatchObject({
      sequence: 3,
      distance: 80,
      elapsed: 4,
    });
    now = startAt + 12000;
    await send({ action: 'poll' }, b);
    const finish = { sequence: 5, distance: 400, elapsed: 12, done: 'finish' };
    await tick(finish);
    const retried = await tick(finish);
    expect(retried.race.own).toEqual(finish);
    expect(retried.race.result).toBeNull();
  });

  it('cancels readiness when a connected player never loads the track', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const invitation = await invite(a, b);
    const { race } = await send({ action: 'accept', id: invitation }, b);
    const id = race.id;
    await send({ action: 'ready', id }, a);
    now += 10000;
    await send({ action: 'ready', id }, a);
    await send({ action: 'poll' }, b);
    now += 10000;
    const timedOut = await send({ action: 'ready', id }, b);
    expect(timedOut.race.startAt).toBeNull();
    expect(timedOut.race.result).toEqual({ winner: null, reason: 'not_ready' });
    expect((await send({ action: 'poll' }, a)).race.result).toEqual(timedOut.race.result);
  });

  it('ends an active duel when one player leaves', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const id = await invite(a, b);
    const { race } = await send({ action: 'accept', id }, b);
    await send({ action: 'ready', id: race.id }, a);
    const ready = await send({ action: 'ready', id: race.id }, b);
    now = ready.race.startAt;
    await send({ action: 'leave' }, a);
    const outcome = await send({ action: 'poll' }, b);
    expect(outcome.players).toHaveLength(1);
    expect(outcome.race.result).toEqual({ winner: b.id, reason: 'left' });
  });

  it('cancels without a winner when a player leaves during the countdown', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const invitation = await invite(a, b);
    const { race } = await send({ action: 'accept', id: invitation }, b);
    await send({ action: 'ready', id: race.id }, a);
    await send({ action: 'ready', id: race.id }, b);
    await send({ action: 'leave' }, a);
    expect((await send({ action: 'poll' }, b)).race.result).toEqual({
      winner: null,
      reason: 'left',
    });
  });

  it('allows brief reconnects and ends the duel after the heartbeat expires', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const invitation = await invite(a, b);
    const { race } = await send({ action: 'accept', id: invitation }, b);
    await send({ action: 'ready', id: race.id }, a);
    now = (await send({ action: 'ready', id: race.id }, b)).race.startAt;
    now += 5000;
    expect((await send({ action: 'poll' }, a)).race.result).toBeNull();
    await send({ action: 'poll' }, b);
    now += 3000;
    expect((await send({ action: 'poll' }, b)).race.result).toBeNull();
    now += 9001;
    expect((await send({ action: 'poll' }, b)).race.result).toEqual({
      winner: b.id,
      reason: 'left',
    });
    expect((await send({ action: 'poll' }, a)).status).toBe(401);
  });
});
