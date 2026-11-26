import { createLobby } from './lobby.js';
import process from 'node:process';

const port = Number(process.env.PORT ?? 8787);
createLobby({ origin: process.env.GAME_ORIGIN }).listen(
  port,
  process.env.HOST ?? '127.0.0.1',
  () => {
    process.stdout.write(`Lobby listening on port ${port}\n`);
  },
);
