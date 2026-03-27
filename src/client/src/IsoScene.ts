import Phaser from 'phaser';
import { Terrain, TERRAIN_MAP, GRID_COLS, GRID_ROWS, RacePhase } from '../../shared/terrain';

// Re-export for any downstream client code that imported from here
export { Terrain, TERRAIN_MAP };

// ─── Tile constants (GDD spec: design/gdd/crazy-stuff-gdd.md) ─────────────────

/** Tile width in pixels (isometric diamond width). */
export const TILE_W = 32;
/** Tile height in pixels (isometric diamond height). */
export const TILE_H = 16;

const TILE_OUTLINE = 0x000000;
const ORIGIN_COLOR = 0xff6b6b; // red — marks tile (0,0)

// ─── Terrain rendering colours ────────────────────────────────────────────────

/**
 * Primary and secondary fill colours [A, B] for the checkerboard shading.
 * Indexed by Terrain value. A = even (tx+ty), B = odd.
 */
const TERRAIN_COLORS: [number, number][] = [
  [0x4a7c59, 0x3d6649], // Normal  — muted green
  [0x7a6030, 0x6a5228], // Slow    — mud brown
  [0x88c8e8, 0x76b8d8], // Slide   — ice blue
  [0xc4824a, 0xb0723c], // Crumble — sandy orange
  [0xd4b800, 0xc0a600], // Boost   — gold
  [0x111820, 0x0c1018], // Hole    — near-black void
];

/** Color assigned to each player slot index. Slot 0 = orange (first joiner). */
const SLOT_COLORS = [0xff8c00, 0x4488ff, 0x44bb44, 0xee44ee, 0xffdd44];

// ─── Reusable isometric math ──────────────────────────────────────────────────

/**
 * Convert isometric tile coordinates to screen pixel offset from the grid origin.
 * Add the scene's originX/Y to get canvas coordinates.
 */
export function tileToScreen(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: (tileX - tileY) * (TILE_W / 2),
    y: (tileX + tileY) * (TILE_H / 2),
  };
}

/**
 * Isometric depth sort value.
 * Call `gameObject.setDepth(isoDepth(tileX, tileY))` on every object that
 * participates in Y-sort. Single source of truth — never compute depth inline.
 */
export function isoDepth(tileX: number, tileY: number): number {
  return tileX + tileY;
}

// ─── Object records ───────────────────────────────────────────────────────────

interface SortableObject {
  obj: Phaser.GameObjects.GameObject & { setDepth(depth: number): unknown };
  tileX: number;
  tileY: number;
}

interface AvatarGraphics {
  body: Phaser.GameObjects.Graphics;
  hat: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
  tileX: number;
  tileY: number;
  slotIndex: number;
  frozen: boolean;
  penalized: boolean;
  boosted: boolean;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class IsoScene extends Phaser.Scene {
  /** Canvas X of tile (0,0). Set in create(). */
  private originX = 0;
  /** Canvas Y of tile (0,0). Set in create(). */
  private originY = 0;

  /** Static demo blocks that participate in the Y-sort pass. */
  private sortables: SortableObject[] = [];

  /** Colyseus session ID assigned on room join. */
  private mySessionId = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private room: any = null;

  /** Facing direction for local player — updated on keypress for arrow drawing. */
  private playerFacing: 'W' | 'A' | 'S' | 'D' = 'S';
  private hatEquipped = true;

  /** All networked player avatars, keyed by slot index (stable across occupant changes). */
  private avatars = new Map<number, AvatarGraphics>();
  /** Slot index of the local player. Set when onAdd fires for our sessionId. */
  private mySlotIndex = -1;

  /** Mutable terrain grid — updated by server terrainChange messages (crumble→hole). */
  private localTerrain: number[][] = TERRAIN_MAP.map(row => [...row]);
  /** Graphics object used for tile rendering — stored so individual tiles can be redrawn. */
  private tileGfx!: Phaser.GameObjects.Graphics;

  // ─── Race phase HUD ─────────────────────────────────────────────────────
  private currentPhase: number = RacePhase.Waiting;
  private phaseText!: Phaser.GameObjects.Text;
  private winnerText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'IsoScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    const gridH = (GRID_COLS - 1 + GRID_ROWS - 1) * (TILE_H / 2) + TILE_H;
    this.originX = width / 2;
    this.originY = (height - gridH) / 2;

    this.drawTileGrid();
    this.placeOriginMarker();
    this.addDepthSortDemo();
    this.setupInput();
    this.addHud();
    this.connectToRace().catch(console.error);
  }

  /**
   * Y-sort pass — called every frame.
   * Re-applies isoDepth() to every registered sortable and all network avatars
   * so moving objects always sort correctly without per-system depth logic.
   */
  update(_time: number, _delta: number): void {
    for (const { obj, tileX, tileY } of this.sortables) {
      obj.setDepth(isoDepth(tileX, tileY));
    }
    for (const av of this.avatars.values()) {
      const depth = isoDepth(av.tileX, av.tileY);
      av.body.setDepth(depth);
      av.hat.setDepth(depth + 0.05);
      av.label.setDepth(depth + 0.1);
      av.statusLabel.setDepth(depth + 0.15);
    }

    // Frozen flash: toggle local player avatar visibility every 500ms
    const localAv = this.avatars.get(this.mySlotIndex);
    if (localAv?.frozen) {
      const flash = Math.floor(_time / 500) % 2 === 0;
      localAv.body.setVisible(flash);
    } else if (localAv) {
      localAv.body.setVisible(true);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Draw the full GRID_COLS × GRID_ROWS tile floor using Phaser Graphics. */
  private drawTileGrid(): void {
    this.tileGfx = this.add.graphics();
    this.renderAllTiles();
    this.tileGfx.setDepth(-1);
  }

  /** Render all tiles from localTerrain into tileGfx. */
  private renderAllTiles(): void {
    this.tileGfx.clear();
    for (let ty = 0; ty < GRID_ROWS; ty++) {
      for (let tx = 0; tx < GRID_COLS; tx++) {
        this.renderTile(tx, ty);
      }
    }
  }

  /** Render a single tile into the shared tileGfx graphics object. */
  private renderTile(tx: number, ty: number): void {
    const terrain = this.localTerrain[ty]?.[tx] ?? Terrain.Normal;
    const [colorA, colorB] = TERRAIN_COLORS[terrain];
    const fill = (tx + ty) % 2 === 0 ? colorA : colorB;

    const { x, y } = tileToScreen(tx, ty);
    const sx = this.originX + x;
    const sy = this.originY + y;
    const pts = this.rhombusPoints(sx, sy);

    this.tileGfx.fillStyle(fill, 1);
    this.tileGfx.fillPoints(pts, true);

    this.tileGfx.lineStyle(1, TILE_OUTLINE, 0.12);
    this.tileGfx.strokePoints(pts, true);
  }

  /** Highlight tile (0,0) in red so the grid origin is immediately identifiable. */
  private placeOriginMarker(): void {
    const { x, y } = tileToScreen(0, 0);
    const sx = this.originX + x;
    const sy = this.originY + y;

    const marker = this.add.graphics();
    marker.fillStyle(ORIGIN_COLOR, 1);
    marker.fillPoints(this.rhombusPoints(sx, sy), true);
    marker.setDepth(isoDepth(0, 0));

    this.add
      .text(sx, sy - 4, '(0,0)', { fontSize: '9px', color: '#ffffff' })
      .setOrigin(0.5, 1)
      .setDepth(isoDepth(0, 0) + 0.1);
  }

  /**
   * Place two colored blocks at different tile positions so the depth sort is
   * visually verifiable without needing networked players.
   */
  private addDepthSortDemo(): void {
    const blockA = this.makeBlock(6, 6, 0x4488ff, 'A');
    const blockB = this.makeBlock(8, 8, 0xffdd44, 'B');
    this.sortables.push(blockA, blockB);
  }

  /** Create a coloured rectangle standing on a tile and register it for Y-sort. */
  private makeBlock(
    tileX: number,
    tileY: number,
    color: number,
    label: string,
  ): SortableObject {
    const { x, y } = tileToScreen(tileX, tileY);
    const sx = this.originX + x;
    const sy = this.originY + y;

    const blockW = 20;
    const blockH = 24;
    const bx = sx;
    const by = sy + TILE_H;

    const gfx = this.add.graphics();
    gfx.fillStyle(color, 1);
    gfx.fillRect(bx - blockW / 2, by - blockH, blockW, blockH);
    gfx.setDepth(isoDepth(tileX, tileY));

    this.add
      .text(bx, by - blockH - 2, label, { fontSize: '10px', color: '#ffffff' })
      .setOrigin(0.5, 1)
      .setDepth(isoDepth(tileX, tileY) + 0.1);

    return { obj: gfx, tileX, tileY };
  }

  /**
   * Wire WASD keys to send move messages to the server.
   * Server is authoritative — no local position update, we wait for state broadcast.
   */
  private setupInput(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-W', () => { console.log('[input] keydown W'); this.sendMove('W'); });
    kb.on('keydown-S', () => { console.log('[input] keydown S'); this.sendMove('S'); });
    kb.on('keydown-A', () => { console.log('[input] keydown A'); this.sendMove('A'); });
    kb.on('keydown-D', () => { console.log('[input] keydown D'); this.sendMove('D'); });
    kb.on('keydown-H', () => {
      this.hatEquipped = !this.hatEquipped;
      // Immediately redraw local avatar for hat toggle — cosmetic-only, not synced
      const av = this.avatars.get(this.mySlotIndex);
      if (av) this.drawAvatarAt(av, av.tileX, av.tileY, true);
    });
  }

  /**
   * Send a move direction to the server. Update facing immediately for
   * responsive arrow visual, but do not update tile position locally.
   * Blocked when phase is not Racing.
   */
  private sendMove(direction: 'W' | 'A' | 'S' | 'D'): void {
    if (this.currentPhase !== RacePhase.Racing) return;
    console.log('[sendMove]', direction, 'room:', !!this.room);
    this.playerFacing = direction;
    if (this.room) {
      this.room.send('move', direction);
    }
  }

  /**
   * Called by onAdd (initial state) and slot.onChange (any property change).
   * Creates, updates, or destroys the avatar for this slot based on slot.occupied.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleSlotChange(slot: any, index: number): void {
    if (slot.occupied) {
      if (!this.avatars.has(index)) {
        this.avatars.set(index, this.createAvatar(index));
      }
      if (slot.sessionId === this.mySessionId) {
        this.mySlotIndex = index;
      }
      const av = this.avatars.get(index)!;
      av.tileX = slot.tileX as number;
      av.tileY = slot.tileY as number;
      av.frozen = slot.frozen ?? false;
      av.penalized = slot.penalized ?? false;
      av.boosted = slot.boosted ?? false;
      const isLocal = slot.sessionId === this.mySessionId;
      this.drawAvatarAt(av, av.tileX, av.tileY, isLocal);
    } else {
      const av = this.avatars.get(index);
      if (av) {
        av.body.destroy();
        av.hat.destroy();
        av.label.destroy();
        av.statusLabel.destroy();
        this.avatars.delete(index);
      }
    }
  }

  private createAvatar(slotIndex: number): AvatarGraphics {
    return {
      body: this.add.graphics(),
      hat: this.add.graphics(),
      label: this.add.text(0, 0, '', { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5, 1),
      statusLabel: this.add.text(0, 0, '', {
        fontSize: '8px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#00000088',
        padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1),
      tileX: 7,
      tileY: 7,
      slotIndex,
      frozen: false,
      penalized: false,
      boosted: false,
    };
  }

  /**
   * Clear and redraw an avatar at the given tile position.
   * Local player gets a direction arrow, optional hat, and effect tinting.
   */
  private drawAvatarAt(
    av: AvatarGraphics,
    tileX: number,
    tileY: number,
    isLocal: boolean,
  ): void {
    const { x, y } = tileToScreen(tileX, tileY);
    const sx = this.originX + x;
    const sy = this.originY + y;

    const blockW = 20;
    const blockH = 28;
    const bx = sx;
    const by = sy + TILE_H; // bottom edge at tile's bottom vertex

    av.body.clear();

    // Determine avatar fill color — apply effect tint for local player
    let color = SLOT_COLORS[av.slotIndex % SLOT_COLORS.length];
    if (isLocal) {
      if (av.frozen) {
        color = 0xff2222;       // red — frozen in hole
      } else if (av.boosted) {
        color = 0xffd700;       // gold — boost active
      } else if (av.penalized) {
        color = 0x88ccff;       // light blue — post-hole penalty
      }
    }

    av.body.fillStyle(color, 1);
    av.body.fillRect(bx - blockW / 2, by - blockH, blockW, blockH);

    // Direction arrow on local player only
    if (isLocal) {
      const cx = bx;
      const cy = by - blockH / 2;
      const ar = 5;
      av.body.fillStyle(0x000000, 0.65);
      switch (this.playerFacing) {
        case 'W':
          av.body.fillTriangle(cx, cy - ar, cx - ar, cy + ar, cx + ar, cy + ar);
          break;
        case 'S':
          av.body.fillTriangle(cx, cy + ar, cx - ar, cy - ar, cx + ar, cy - ar);
          break;
        case 'A':
          av.body.fillTriangle(cx - ar, cy, cx + ar, cy - ar, cx + ar, cy + ar);
          break;
        case 'D':
          av.body.fillTriangle(cx + ar, cy, cx - ar, cy - ar, cx - ar, cy + ar);
          break;
      }
    }

    av.label.setPosition(bx, by - blockH - 2).setText(`(${tileX},${tileY})`);

    // Status indicator above coord label — local player only
    if (isLocal) {
      let statusText = '';
      let statusColor = '#ffffff';
      if (av.frozen) {
        statusText = 'FROZEN';
        statusColor = '#ff4444';
      } else if (av.boosted) {
        statusText = 'BOOSTED';
        statusColor = '#ffd700';
      } else if (av.penalized) {
        statusText = 'SLOW';
        statusColor = '#88ccff';
      }
      av.statusLabel
        .setPosition(bx, by - blockH - 14)
        .setText(statusText)
        .setColor(statusColor)
        .setVisible(statusText !== '');
    } else {
      av.statusLabel.setVisible(false);
    }

    // Hat layer — local player only, toggleable with H key (not synced to server)
    av.hat.clear();
    if (isLocal && this.hatEquipped) {
      const hatW = 18;
      const crownH = 6;
      const brimH = 3;
      const hatTop = by - blockH - crownH - brimH;
      av.hat.fillStyle(0x9b59b6, 1); // purple
      av.hat.fillRect(bx - hatW / 2 + 2, hatTop, hatW - 4, crownH);
      av.hat.fillRect(bx - hatW / 2, hatTop + crownH, hatW, brimH);
    }
  }

  /** Connect to Colyseus RaceRoom and receive state via plain JSON messages. */
  private async connectToRace(): Promise<void> {
    const { Client } = await import('colyseus.js');
    const client = new Client('ws://localhost:3000');
    const room = await client.joinOrCreate('race', { playerName: 'Player' });
    this.room = room;
    this.mySessionId = room.sessionId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    room.onMessage('state', (data: { phase: number; countdown: number; slots: any[] }) => {
      this.currentPhase = data.phase;
      this.updatePhaseHud(data.phase, data.countdown);
      data.slots.forEach((slot, index) => this.handleSlotChange(slot, index));
    });

    room.onMessage('terrainChange', (data: { tileX: number; tileY: number; terrain: number }) => {
      this.localTerrain[data.tileY][data.tileX] = data.terrain;
      // Redraw entire grid (single Graphics object — can't patch one tile)
      this.renderAllTiles();
    });

    room.onMessage('raceFinished', (data: { playerName: string; timeSeconds: number }) => {
      this.showWinner(data.playerName, data.timeSeconds);
    });

    console.log('[IsoScene] connected to RaceRoom:', this.mySessionId);
  }

  /** Fixed HUD — terrain legend + race phase display. */
  private addHud(): void {
    // Terrain legend (top-left)
    this.add
      .text(8, 8, 'Terrain: green=Normal · brown=Slow · blue=Ice · orange=Crumble · gold=Boost · black=Hole', {
        fontSize: '11px',
        color: '#aabbcc',
        backgroundColor: '#00000055',
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(9999);

    // Phase status (top-center)
    const { width } = this.scale;
    this.phaseText = this.add
      .text(width / 2, 8, 'Waiting for players...', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(9999);

    // Winner announcement (centered, hidden initially)
    const { height } = this.scale;
    this.winnerText = this.add
      .text(width / 2, height / 2, '', {
        fontSize: '28px',
        color: '#ffdd44',
        backgroundColor: '#000000cc',
        padding: { x: 24, y: 16 },
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(false);
  }

  /** Update the phase HUD text based on current server phase. */
  private updatePhaseHud(phase: number, countdown: number): void {
    switch (phase) {
      case RacePhase.Waiting:
        this.phaseText.setText('Waiting for players...');
        this.phaseText.setColor('#aaaaaa');
        break;
      case RacePhase.Countdown:
        this.phaseText.setText(`Starting in ${countdown}...`);
        this.phaseText.setColor('#ffdd44');
        break;
      case RacePhase.Racing:
        this.phaseText.setText('Racing!');
        this.phaseText.setColor('#44ff44');
        break;
      case RacePhase.Finished:
        this.phaseText.setText('Race Over');
        this.phaseText.setColor('#ff6666');
        break;
    }
  }

  /** Show the big centered winner announcement. */
  private showWinner(playerName: string, timeSeconds: number): void {
    this.winnerText
      .setText(`${playerName} wins!\n${timeSeconds.toFixed(2)}s`)
      .setVisible(true);
  }

  /** Four corners of an isometric diamond tile in screen space. */
  private rhombusPoints(sx: number, sy: number): Array<{ x: number; y: number }> {
    return [
      { x: sx, y: sy },                           // top
      { x: sx + TILE_W / 2, y: sy + TILE_H / 2 }, // right
      { x: sx, y: sy + TILE_H },                  // bottom
      { x: sx - TILE_W / 2, y: sy + TILE_H / 2 }, // left
    ];
  }
}
