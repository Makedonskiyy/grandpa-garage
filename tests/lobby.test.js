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
    const { race } = await send({ action: 'accept', id: invitation }, b);
    expect((await send({ action: 'poll' }, a)).race.startAt).toBe(race.startAt);
    const tick = (player, state) => send({ action: 'tick', id: race.id, state }, player);
    expect((await tick(a, { distance: 400, elapsed: 10, done: 'finish' })).status).toBe(409);
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

  it('ends an active duel when one player leaves', async () => {
    const a = await send({ action: 'join', nick: 'Racer_one' });
    const b = await send({ action: 'join', nick: 'Racer_two' });
    const id = await invite(a, b);
    await send({ action: 'accept', id }, b);
    await send({ action: 'leave' }, a);
    const outcome = await send({ action: 'poll' }, b);
    expect(outcome.players).toHaveLength(1);
    expect(outcome.race.result).toEqual({ winner: b.id, reason: 'left' });
  });
});
