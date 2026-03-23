import { Room, Client } from 'colyseus';
import { Schema, ArraySchema, type } from '@colyseus/schema';

class PlayerSlot extends Schema {
  @type('string') sessionId = '';
  @type('string') playerName = '';
  @type('number') tileX = 7;
  @type('number') tileY = 7;
  @type('boolean') occupied = false;
}

class RaceState extends Schema {
  @type([PlayerSlot]) slots = new ArraySchema<PlayerSlot>(
    new PlayerSlot(), new PlayerSlot(), new PlayerSlot(),
    new PlayerSlot(), new PlayerSlot(),
  );
}

// Isometric diagonal movement — matches client IsoScene WASD mapping:
//   W (-1,-1) → screen up    S (+1,+1) → screen down
//   A (-1,+1) → screen left  D (+1,-1) → screen right
const MOVE_DELTAS: Record<string, [number, number]> = {
  W: [-1, -1], S: [1, 1], A: [-1, 1], D: [1, -1],
};

const GRID_MAX = 14;

export class RaceRoom extends Room<RaceState> {
  maxClients = 5;

  onCreate(): void {
    this.setState(new RaceState());

    this.onMessage('move', (client, direction: string) => {
      const slot = this.state.slots.find(s => s.sessionId === client.sessionId);
      if (!slot) return;
      const delta = MOVE_DELTAS[direction];
      if (!delta) return;
      slot.tileX = Math.max(0, Math.min(GRID_MAX, slot.tileX + delta[0]));
      slot.tileY = Math.max(0, Math.min(GRID_MAX, slot.tileY + delta[1]));
      this.broadcastState();
    });

    console.log('[RaceRoom] created');
  }

  onJoin(client: Client, options: { playerName?: string }): void {
    const slot = this.state.slots.find(s => !s.occupied);
    if (!slot) { client.leave(); return; }
    slot.sessionId = client.sessionId;
    slot.playerName = options?.playerName ?? 'Player';
    slot.tileX = 7;
    slot.tileY = 7;
    slot.occupied = true;
    const idx = this.state.slots.indexOf(slot);
    console.log(`[RaceRoom] joined: ${client.sessionId} as "${slot.playerName}" in slot ${idx}`);
    this.broadcastState();
  }

  onLeave(client: Client): void {
    const slot = this.state.slots.find(s => s.sessionId === client.sessionId);
    if (!slot) return;
    const idx = this.state.slots.indexOf(slot);
    slot.sessionId = '';
    slot.playerName = '';
    slot.tileX = 7;
    slot.tileY = 7;
    slot.occupied = false;
    console.log(`[RaceRoom] left: ${client.sessionId} freed slot ${idx}`);
    this.broadcastState();
  }

  private broadcastState(): void {
    this.broadcast('state', {
      slots: this.state.slots.map(s => ({
        sessionId: s.sessionId,
        playerName: s.playerName,
        tileX: s.tileX,
        tileY: s.tileY,
        occupied: s.occupied,
      })),
    });
  }

  onDispose(): void {
    console.log('[RaceRoom] disposed');
  }
}
