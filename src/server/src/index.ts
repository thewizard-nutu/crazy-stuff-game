import http from 'http';
import express from 'express';
import { Server } from 'colyseus';
import { LobbyRoom } from './rooms/LobbyRoom';
import { RaceRoom } from './rooms/RaceRoom';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define('lobby', LobbyRoom);
gameServer.define('race', RaceRoom);

httpServer.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
