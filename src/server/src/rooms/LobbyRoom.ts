import { Room, Client } from 'colyseus';
import { Schema, type } from '@colyseus/schema';
import { verifyToken } from '../auth/jwt';

class LobbyState extends Schema {
  @type('number') playerCount = 0;
}

interface LobbyPlayer {
  sessionId: string;
  playerName: string;
  x: number;
  y: number;
  facing: string;
  moving: boolean;
  charKey: string;
}

export class LobbyRoom extends Room<LobbyState> {
  private lobbyPlayers = new Map<string, LobbyPlayer>();

  onCreate(): void {
    this.setState(new LobbyState());

    this.onMessage('move', (client, data: { x: number; y: number; facing: string; moving: boolean }) => {
      const p = this.lobbyPlayers.get(client.sessionId);
      if (!p) return;
      p.x = data.x;
      p.y = data.y;
      p.facing = data.facing;
      p.moving = data.moving;
    });

    this.onMessage('changeChar', (client, data: { charKey: string }) => {
      const allowed = ['male', 'female', 'male-medium', 'female-medium', 'male-dark', 'female-dark'];
      if (!data?.charKey || !allowed.includes(data.charKey)) return;
      const p = this.lobbyPlayers.get(client.sessionId);
      if (!p) return;
      p.charKey = data.charKey;
      // Immediate broadcast so everyone sees the change right away
      const players = Array.from(this.lobbyPlayers.values());
      this.broadcast('lobbyState', { players });
    });

    this.onMessage('chat', (client, data: { message?: string }) => {
      const p = this.lobbyPlayers.get(client.sessionId);
      if (!p || !data?.message) return;
      const message = data.message.slice(0, 100).trim();
      if (!message) return;
      this.broadcast('chat', {
        sessionId: client.sessionId,
        playerName: p.playerName,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // Broadcast positions at 10 ticks/sec
    this.setSimulationInterval(() => {
      const players = Array.from(this.lobbyPlayers.values());
      this.broadcast('lobbyState', { players });
    }, 100);

    console.log('[LobbyRoom] created');
  }

  /** See design/gdd/03-authentication.md §3.7 — lobby is guest-friendly; token (if supplied) must verify. */
  onAuth(_client: Client, options: { token?: string }): { authId: string | null; username: string | null } | false {
    if (!options?.token) return { authId: null, username: null };
    const payload = verifyToken(options.token);
    if (!payload) return false;
    return { authId: payload.sub, username: payload.username };
  }

  onJoin(client: Client, options: { playerName?: string; charKey?: string }, auth?: { authId: string | null; username: string | null }): void {
    const name = (options?.playerName ?? auth?.username ?? 'Player').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20).trim() || 'Player';
    this.lobbyPlayers.set(client.sessionId, {
      sessionId: client.sessionId,
      playerName: name,
      x: 400,
      y: 360,
      facing: 'SD',
      moving: false,
      charKey: options?.charKey ?? 'male',
    });
    this.state.playerCount = this.lobbyPlayers.size;
    console.log(`[LobbyRoom] joined: ${name} (total: ${this.state.playerCount})`);
  }

  onLeave(client: Client): void {
    this.lobbyPlayers.delete(client.sessionId);
    this.state.playerCount = this.lobbyPlayers.size;
    console.log(`[LobbyRoom] left: ${client.sessionId} (total: ${this.state.playerCount})`);
  }

  onDispose(): void {
    console.log('[LobbyRoom] disposed');
  }
}
