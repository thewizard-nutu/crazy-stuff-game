import { Room, Client } from 'colyseus';
import { Schema, ArraySchema, type } from '@colyseus/schema';
import { Terrain, TERRAIN_MAP, GRID_MAX, SPAWN_X, SPAWN_Y } from '../../../shared/terrain';

// ─── Schema ──────────────────────────────────────────────────────────────────

class PlayerSlot extends Schema {
  @type('string') sessionId = '';
  @type('string') playerName = '';
  @type('number') tileX = SPAWN_X;
  @type('number') tileY = SPAWN_Y;
  @type('boolean') occupied = false;
}

class RaceState extends Schema {
  @type([PlayerSlot]) slots = new ArraySchema<PlayerSlot>(
    new PlayerSlot(), new PlayerSlot(), new PlayerSlot(),
    new PlayerSlot(), new PlayerSlot(),
  );
}

// ─── Movement constants ──────────────────────────────────────────────────────

/** Isometric diagonal movement — matches client WASD mapping. */
const MOVE_DELTAS: Record<string, [number, number]> = {
  W: [-1, -1], S: [1, 1], A: [-1, 1], D: [1, -1],
};

// ─── Timing constants (ms) ───────────────────────────────────────────────────

const DEFAULT_COOLDOWN = 150;     // base movement cooldown (instant feel, anti-spam)
const SLOW_COOLDOWN    = 500;     // Slow terrain next-move cooldown
const HOLE_RESPAWN_MS  = 3000;    // time frozen in hole before respawn
const HOLE_PENALTY_MS  = 3000;    // speed penalty duration after hole respawn
const HOLE_PENALTY_CD  = 650;     // cooldown during hole penalty (25% slower than slow)
const CRUMBLE_DELAY_MS = 1500;    // time before crumble tile becomes a hole
const SLIDE_EXTRA_TILES = 2;      // extra tiles of automatic movement on slide

// ─── Per-player state (not synced to schema — server-only bookkeeping) ───────

interface PlayerState {
  /** Timestamp of last accepted move. */
  lastMoveTime: number;
  /** Cooldown (ms) that must elapse before next move is accepted. */
  currentCooldown: number;
  /** If true, next move is instant AND the move after that is also instant. */
  boostCharges: number;
  /** If true, player is frozen (hole respawn in progress). */
  frozen: boolean;
  /** Timeout handle for hole respawn. */
  holeTimer: ReturnType<typeof setTimeout> | null;
  /** Timeout handle for hole speed penalty expiry. */
  penaltyTimer: ReturnType<typeof setTimeout> | null;
  /** Whether the player is currently under hole speed penalty. */
  penalized: boolean;
}

// ─── RaceRoom ────────────────────────────────────────────────────────────────

export class RaceRoom extends Room<RaceState> {
  maxClients = 5;

  /** Server-side per-player state, keyed by sessionId. */
  private players = new Map<string, PlayerState>();

  /**
   * Mutable copy of the terrain map for crumble tracking.
   * Indexed [tileY][tileX]. Starts as a deep copy of the shared TERRAIN_MAP.
   */
  private terrainGrid: number[][] = [];

  /** Tracks crumble timers so we don't double-schedule. Key: "x,y". */
  private crumbleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  onCreate(): void {
    this.setState(new RaceState());
    this.resetTerrainGrid();

    this.onMessage('move', (client, direction: string) => {
      this.handleMove(client.sessionId, direction);
    });

    console.log('[RaceRoom] created');
  }

  onJoin(client: Client, options: { playerName?: string }): void {
    const slot = this.state.slots.find(s => !s.occupied);
    if (!slot) { client.leave(); return; }

    slot.sessionId = client.sessionId;
    slot.playerName = options?.playerName ?? 'Player';
    slot.tileX = SPAWN_X;
    slot.tileY = SPAWN_Y;
    slot.occupied = true;

    this.players.set(client.sessionId, {
      lastMoveTime: 0,
      currentCooldown: DEFAULT_COOLDOWN,
      boostCharges: 0,
      frozen: false,
      holeTimer: null,
      penaltyTimer: null,
      penalized: false,
    });

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
    slot.tileX = SPAWN_X;
    slot.tileY = SPAWN_Y;
    slot.occupied = false;

    // Clean up timers
    const ps = this.players.get(client.sessionId);
    if (ps) {
      if (ps.holeTimer) clearTimeout(ps.holeTimer);
      if (ps.penaltyTimer) clearTimeout(ps.penaltyTimer);
    }
    this.players.delete(client.sessionId);

    console.log(`[RaceRoom] left: ${client.sessionId} freed slot ${idx}`);
    this.broadcastState();
  }

  onDispose(): void {
    // Clear all crumble timers
    for (const timer of this.crumbleTimers.values()) clearTimeout(timer);
    this.crumbleTimers.clear();

    // Clear all player timers
    for (const ps of this.players.values()) {
      if (ps.holeTimer) clearTimeout(ps.holeTimer);
      if (ps.penaltyTimer) clearTimeout(ps.penaltyTimer);
    }

    console.log('[RaceRoom] disposed');
  }

  // ─── Movement handling ────────────────────────────────────────────────────

  private handleMove(sessionId: string, direction: string): void {
    const slot = this.state.slots.find(s => s.sessionId === sessionId);
    const ps = this.players.get(sessionId);
    if (!slot || !ps) return;

    const delta = MOVE_DELTAS[direction];
    if (!delta) return;

    // Frozen players (in a hole) cannot move
    if (ps.frozen) return;

    // Cooldown check
    const now = Date.now();
    const elapsed = now - ps.lastMoveTime;

    // Boost charges grant instant movement (skip cooldown)
    if (ps.boostCharges > 0) {
      ps.boostCharges--;
    } else if (elapsed < ps.currentCooldown) {
      return; // still on cooldown
    }

    // Apply movement with bounds clamping
    const newX = Math.max(0, Math.min(GRID_MAX, slot.tileX + delta[0]));
    const newY = Math.max(0, Math.min(GRID_MAX, slot.tileY + delta[1]));

    // Don't process if clamped to same position
    if (newX === slot.tileX && newY === slot.tileY) return;

    slot.tileX = newX;
    slot.tileY = newY;
    ps.lastMoveTime = now;

    // Apply terrain effect at new position
    this.applyTerrainEffect(sessionId, slot, ps, direction);

    this.broadcastState();
  }

  // ─── Terrain effects ──────────────────────────────────────────────────────

  private applyTerrainEffect(
    sessionId: string,
    slot: PlayerSlot,
    ps: PlayerState,
    direction: string,
  ): void {
    const terrain = this.terrainAtMutable(slot.tileX, slot.tileY);

    // Reset cooldown to default (may be overridden below)
    if (ps.penalized) {
      ps.currentCooldown = HOLE_PENALTY_CD;
    } else {
      ps.currentCooldown = DEFAULT_COOLDOWN;
    }

    switch (terrain) {
      case Terrain.Normal:
        // No special effect
        break;

      case Terrain.Slow:
        // Next move takes 500ms cooldown
        ps.currentCooldown = SLOW_COOLDOWN;
        break;

      case Terrain.Boost:
        // Next move is instant AND the one after that (2 boost charges)
        ps.boostCharges = 2;
        ps.currentCooldown = 0;
        break;

      case Terrain.Hole:
        this.handleHole(sessionId, slot, ps);
        break;

      case Terrain.Slide:
        this.handleSlide(sessionId, slot, ps, direction);
        break;

      case Terrain.Crumble:
        this.handleCrumble(slot.tileX, slot.tileY);
        break;
    }
  }

  /** Hole: freeze player, respawn at (7,7) after 3s, 25% speed penalty for 3s more. */
  private handleHole(sessionId: string, slot: PlayerSlot, ps: PlayerState): void {
    ps.frozen = true;
    ps.boostCharges = 0;

    ps.holeTimer = setTimeout(() => {
      // Player may have disconnected during the timer
      const currentSlot = this.state.slots.find(s => s.sessionId === sessionId);
      const currentPs = this.players.get(sessionId);
      if (!currentSlot || !currentPs) return;

      // Respawn at center
      currentSlot.tileX = SPAWN_X;
      currentSlot.tileY = SPAWN_Y;
      currentPs.frozen = false;
      currentPs.holeTimer = null;

      // Apply speed penalty
      currentPs.penalized = true;
      currentPs.currentCooldown = HOLE_PENALTY_CD;

      currentPs.penaltyTimer = setTimeout(() => {
        const stillPs = this.players.get(sessionId);
        if (!stillPs) return;
        stillPs.penalized = false;
        stillPs.currentCooldown = DEFAULT_COOLDOWN;
        stillPs.penaltyTimer = null;
      }, HOLE_PENALTY_MS);

      this.broadcastState();
    }, HOLE_RESPAWN_MS);
  }

  /** Slide: auto-continue in the same direction for 2 extra tiles. */
  private handleSlide(
    sessionId: string,
    slot: PlayerSlot,
    ps: PlayerState,
    direction: string,
  ): void {
    const delta = MOVE_DELTAS[direction];
    if (!delta) return;

    for (let i = 0; i < SLIDE_EXTRA_TILES; i++) {
      const nextX = Math.max(0, Math.min(GRID_MAX, slot.tileX + delta[0]));
      const nextY = Math.max(0, Math.min(GRID_MAX, slot.tileY + delta[1]));

      // Stop sliding if we hit the edge
      if (nextX === slot.tileX && nextY === slot.tileY) break;

      slot.tileX = nextX;
      slot.tileY = nextY;

      // Check terrain at each slide step
      const slideTerrain = this.terrainAtMutable(nextX, nextY);

      // Hole interrupts sliding
      if (slideTerrain === Terrain.Hole) {
        this.handleHole(sessionId, slot, ps);
        return;
      }

      // Crumble triggers at each step
      if (slideTerrain === Terrain.Crumble) {
        this.handleCrumble(nextX, nextY);
      }

      // Stop sliding if we leave slide terrain
      if (slideTerrain !== Terrain.Slide && slideTerrain !== Terrain.Boost) {
        break;
      }
    }

    // Apply terrain effect of final landing tile (non-slide effects)
    const finalTerrain = this.terrainAtMutable(slot.tileX, slot.tileY);
    if (finalTerrain === Terrain.Slow) {
      ps.currentCooldown = SLOW_COOLDOWN;
    } else if (finalTerrain === Terrain.Boost) {
      ps.boostCharges = 2;
      ps.currentCooldown = 0;
    }
  }

  /** Crumble: tile becomes a Hole after 1.5s of first being stepped on. */
  private handleCrumble(tileX: number, tileY: number): void {
    const key = `${tileX},${tileY}`;
    if (this.crumbleTimers.has(key)) return; // already crumbling

    this.crumbleTimers.set(key, setTimeout(() => {
      // Mutate terrain grid — tile is now a hole
      this.terrainGrid[tileY][tileX] = Terrain.Hole;
      this.crumbleTimers.delete(key);

      // Check if any player is standing on this tile and apply hole effect
      for (const slot of this.state.slots) {
        if (!slot.occupied) continue;
        if (slot.tileX === tileX && slot.tileY === tileY) {
          const ps = this.players.get(slot.sessionId);
          if (ps && !ps.frozen) {
            this.handleHole(slot.sessionId, slot, ps);
          }
        }
      }

      // Broadcast terrain change to clients
      this.broadcast('terrainChange', { tileX, tileY, terrain: Terrain.Hole });
      this.broadcastState();
    }, CRUMBLE_DELAY_MS));
  }

  // ─── Terrain grid helpers ─────────────────────────────────────────────────

  /** Deep-copy the shared TERRAIN_MAP into mutable server state. */
  private resetTerrainGrid(): void {
    this.terrainGrid = TERRAIN_MAP.map(row => [...row]);
  }

  /** Look up terrain from the mutable server grid (reflects crumble→hole changes). */
  private terrainAtMutable(tileX: number, tileY: number): number {
    if (tileX < 0 || tileX > GRID_MAX || tileY < 0 || tileY > GRID_MAX) {
      return Terrain.Normal;
    }
    return this.terrainGrid[tileY]?.[tileX] ?? Terrain.Normal;
  }

  // ─── State broadcast ──────────────────────────────────────────────────────

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
}
