import { el, fill } from './dom.js';
import { webButton } from './components.js';
import { openModal } from './overlay.js';
import { computeStats } from '../systems/simulate.js';
import {
  duelBuild,
  duelCondition,
  getNickname,
  hasLobbyEndpoint,
  leaveLobby,
  lobbyRequest,
  setNickname,
} from '../systems/multiplayer.js';

export function nicknameForm(onSubmit, buttonLabel = 'Сохранить') {
  const input = el('input', {
    class: 'duel-nick',
    type: 'text',
    name: 'nickname',
    maxlength: 12,
    value: getNickname(),
    autocomplete: 'off',
    required: true,
  });
  const status = el('p', { class: 'duel-status', role: 'status' });
  const submit = el('button', { class: 'duel-button', type: 'submit', text: buttonLabel });
  const form = el('form', { class: 'duel-form' }, [
    el('label', { class: 'duel-label' }, [el('span', { text: 'Ник в мультиплеере' }), input]),
    el('p', {
      class: 'duel-status',
      text: 'От 3 до 12 символов. Буквы, цифры, дефис и подчёркивание.',
    }),
    submit,
    status,
  ]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await onSubmit(input.value);
      status.textContent = buttonLabel === 'Сохранить' ? 'Ник сохранён.' : '';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

export function openDuelLobby(onRace) {
  if (!hasLobbyEndpoint) {
    openModal(() => el('p', { text: 'Тестовое лобби пока не подключено к этой сборке.' }), {
      id: 'duel-lobby',
      title: 'Мультиплеер · тест',
    });
    return;
  }
  let token;
  let passedToRace = false;
  let closed = false;
  let timer;
  let queue = Promise.resolve();
  let queued = 0;
  let view;
  const stats = computeStats(duelBuild, duelCondition);

  openModal(
    (close) => {
      const content = el('div', { class: 'duel-lobby' });
      const status = el('p', { class: 'duel-status', role: 'status' });
      const count = el('p', { class: 'duel-count' });
      const invitation = el('div', { class: 'duel-invite' });
      const players = el('ul', { class: 'duel-players' });
      const rows = new Map();

      function update(body) {
        if (closed || (body.action === 'poll' && queued)) return;
        queued += 1;
        const operation = queue
          .then(() => request(body))
          .finally(() => {
            queued -= 1;
          });
        queue = operation.catch(() => {});
        return operation;
      }

      async function request(body) {
        if (closed) return;
        try {
          const next = await lobbyRequest(body, token);
          token ??= next.token;
          if (closed) return leaveLobby(token);
          if (body.action === 'join') setNickname(body.nick);
          if (next.race) {
            passedToRace = true;
            close();
            onRace({ ...next.race, playerId: next.id, token });
            return;
          }
          view = next;
          if (body.action !== 'join') render();
        } catch (error) {
          status.textContent = error.message;
          if (error.status === 401) {
            clearInterval(timer);
            token = null;
            showJoin();
          }
          if (body.action === 'join') throw error;
        }
      }

      function render() {
        status.textContent = view.notice ?? '';
        count.textContent = 'Онлайн: ' + view.players.length;
        const invite = view.invite;
        if (invitation.dataset.id !== (invite?.id ?? '')) {
          invitation.dataset.id = invite?.id ?? '';
          fill(
            invitation,
            invite
              ? [
                  el('p', {
                    text: invite.incoming
                      ? invite.nick + ' приглашает на гонку'
                      : 'Ждём ответа от ' + invite.nick,
                  }),
                  invite.incoming
                    ? el('div', { class: 'duel-actions' }, [
                        webButton('Принять', () => update({ action: 'accept', id: invite.id }), {
                          variant: 'primary',
                          className: 'duel-button',
                        }),
                        webButton('Отклонить', () => update({ action: 'decline', id: invite.id }), {
                          className: 'duel-button',
                        }),
                      ])
                    : null,
                ]
              : [],
          );
        }
        const others = view.players.filter(({ id }) => id !== view.id);
        for (const [id, row] of rows) {
          if (!others.some((player) => player.id === id)) {
            row.node.remove();
            rows.delete(id);
          }
        }
        for (const player of others) {
          let row = rows.get(player.id);
          if (!row) {
            const button = webButton(
              'Пригласить',
              () => update({ action: 'invite', id: player.id }),
              { className: 'duel-button' },
            );
            const node = el('li', {}, [
              el('div', {}, [
                el('strong', { text: player.nick }),
                el('p', { text: Math.round(stats.power) + ' л.с. · ' + stats.mass + ' кг · МКПП' }),
              ]),
              button,
            ]);
            row = { node, button };
            rows.set(player.id, row);
            players.append(node);
          }
          row.button.disabled = Boolean(invite) || player.busy;
          row.button.querySelector('.wbtn__label').textContent = player.busy
            ? 'В заезде'
            : 'Пригласить';
        }
        players.hidden = others.length === 0;
        content.querySelector('.duel-empty').hidden = others.length !== 0;
      }

      function showJoin() {
        fill(content, [
          nicknameForm(async (nick) => {
            await update({ action: 'join', nick });
            if (closed || !token) return;
            fill(content, [
              el('p', { text: 'Дуэль на 400 м. Одинаковые машины, ручная коробка.' }),
              count,
              invitation,
              el('p', {
                class: 'duel-empty',
                text: 'Пока здесь никого нет. Оставь окно открытым, пока друг входит.',
              }),
              players,
              status,
            ]);
            render();
            timer = setInterval(() => update({ action: 'poll' }), 500);
          }, 'Войти в лобби'),
        ]);
      }

      showJoin();
      return content;
    },
    {
      id: 'duel-lobby',
      title: 'Мультиплеер · тест',
      onClose: () => {
        closed = true;
        clearInterval(timer);
        if (!passedToRace) leaveLobby(token);
      },
    },
  );
}
