import Phaser from 'phaser';
import {
  Terrain, GRID_COLS, GRID_ROWS, RacePhase, FOOTPRINT,
  FINISH_X, FINISH_Y_MIN, FINISH_Y_MAX, SPAWN_X, SPAWN_Y,
  ButtonType, PICKUP_NAMES, SLIME_SIZE,
  type ButtonDef, type PickupDef, type RaceResult,
} from '../../shared/terrain';

// ─── Tile constants (half-size tiles for finer grid) ─────────────────────────

/** Tile width in pixels (isometric diamond width). */
export const TILE_W = 16;
/** Tile height in pixels (isometric diamond height). */
export const TILE_H = 8;

const TILE_OUTLINE = 0x000000;
const FINISH_COLOR = 0x44ff44;

// ─── Terrain rendering colours ───────────────────────────────────────────────

const TERRAIN_COLORS: [number, number][] = [
  [0x4a7c59, 0x3d6649], // Normal  — muted green
  [0x7a6030, 0x6a5228], // Slow    — mud brown
  [0x88c8e8, 0x76b8d8], // Slide   — ice blue
  [0xc4824a, 0xb0723c], // Crumble — sandy orange
  [0xd4b800, 0xc0a600], // Boost   — gold
  [0x111820, 0x0c1018], // Hole    — near-black void
  [0x555566, 0x444455], // Wall    — dark stone grey
  [0xdd3388, 0xcc2277], // Button  — bright magenta
];

const SLOT_COLORS = [0xff8c00, 0x4488ff, 0x44bb44, 0xee44ee, 0xffdd44];

// ─── Isometric math ──────────────────────────────────────────────────────────

export function tileToScreen(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: (tileX - tileY) * (TILE_W / 2),
    y: (tileX + tileY) * (TILE_H / 2),
  };
}

export function isoDepth(tileX: number, tileY: number): number {
  return tileX + tileY;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AvatarGraphics {
  body: Phaser.GameObjects.Graphics;
  hat: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  statusLabel: Phaser.GameObjects.Text;
  tileX: number;
  tileY: number;
  slotIndex: number;
  playerName: string;
  frozen: boolean;
  penalized: boolean;
  currentTerrain: number;
  // Pickup-related
  heldPickup: number | null;
  shieldActive: boolean;
  speedBoosted: boolean;
  stuck: boolean;
  knockbackSlowed: boolean;
}

// ─── Key-hold constants ──────────────────────────────────────────────────────

/** Minimum ms between auto-repeat sends while a key is held. */
const SEND_INTERVAL = 60;

// ─── Scene ───────────────────────────────────────────────────────────────────

export class IsoScene extends Phaser.Scene {
  private originX = 0;
  private originY = 0;

  private mySessionId = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private room: any = null;

  private playerFacing: 'W' | 'A' | 'S' | 'D' = 'S';
  private hatEquipped = true;

  private avatars = new Map<number, AvatarGraphics>();
  private mySlotIndex = -1;

  /** Server-provided terrain grid. Starts empty; populated by 'mapData' message. */
  private localTerrain: number[][] = [];
  private tileGfx!: Phaser.GameObjects.Graphics;
  private finishGfx!: Phaser.GameObjects.Graphics;

  // ─── Race phase HUD ─────────────────────────────────────────────────────
  private currentPhase: number = RacePhase.Waiting;
  private phaseText!: Phaser.GameObjects.Text;
  private resultsText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private raceStartTime = 0;

  // ─── Buttons & pickups ───────────────────────────────────────────────────
  private buttons: ButtonDef[] = [];
  private buttonLabels: Phaser.GameObjects.Text[] = [];
  private pickups: PickupDef[] = [];
  private collectedPickupIds = new Set<number>();
  private pickupGfx!: Phaser.GameObjects.Graphics;
  private pickupHudText!: Phaser.GameObjects.Text;
  private slimeGfx!: Phaser.GameObjects.Graphics;
  /** Active slime zones for rendering. */
  private slimeZones: { x: number; y: number; size: number }[] = [];

  // ─── Crumble warnings ────────────────────────────────────────────────────
  /** Tiles currently crumbling — flashed in update(). Key: "x,y", value: start timestamp. */
  private crumbleWarnings = new Map<string, number>();
  private crumbleGfx!: Phaser.GameObjects.Graphics;

  // ─── Minimap ─────────────────────────────────────────────────────────────
  private minimapBg!: Phaser.GameObjects.Graphics;
  private minimapPlayers!: Phaser.GameObjects.Graphics;
  private readonly MINIMAP_SCALE = 2; // pixels per tile column
  private readonly MINIMAP_PAD = 6;

  // ─── Key-hold state ─────────────────────────────────────────────────────
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastSendTime = 0;

  constructor() {
    super({ key: 'IsoScene' });
  }

  create(): void {
    // Initialize empty terrain (will be replaced by server mapData)
    this.initEmptyTerrain();

    // Compute grid bounding box in screen space relative to origin
    const topLeft = tileToScreen(0, GRID_ROWS - 1);
    const topRight = tileToScreen(GRID_COLS - 1, 0);
    const bottomRight = tileToScreen(GRID_COLS - 1, GRID_ROWS - 1);

    const gridMinX = topLeft.x - TILE_W / 2;
    const gridMaxX = topRight.x + TILE_W / 2;
    const gridMinY = 0;
    const gridMaxY = bottomRight.y + TILE_H;

    const gridW = gridMaxX - gridMinX;
    const gridH = gridMaxY - gridMinY;

    const pad = 60;
    this.originX = pad - gridMinX;
    this.originY = pad - gridMinY;

    const worldW = gridW + pad * 2;
    const worldH = gridH + pad * 2;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.drawTileGrid();
    this.drawFinishLine();
    this.crumbleGfx = this.add.graphics().setDepth(-0.3);
    this.pickupGfx = this.add.graphics().setDepth(-0.2);
    this.slimeGfx = this.add.graphics().setDepth(-0.4);
    this.initMinimap();
    this.setupInput();
    this.addHud();
    this.connectToRace().catch(console.error);
  }

  update(_time: number, _delta: number): void {
    // Depth sort avatars
    for (const av of this.avatars.values()) {
      const depth = isoDepth(av.tileX + 1, av.tileY + 1); // bottom of 2×2 footprint
      av.body.setDepth(depth);
      av.hat.setDepth(depth + 0.05);
      av.label.setDepth(depth + 0.1);
      av.statusLabel.setDepth(depth + 0.15);
    }

    // Frozen flash
    const localAv = this.avatars.get(this.mySlotIndex);
    if (localAv?.frozen) {
      localAv.body.setVisible(Math.floor(_time / 500) % 2 === 0);
    } else if (localAv) {
      localAv.body.setVisible(true);
    }

    // Pickup HUD update
    this.updatePickupHud();

    // Camera follow — center on the middle of the 2×2 footprint
    if (localAv) {
      const { x, y } = tileToScreen(localAv.tileX, localAv.tileY);
      // Center of 2×2 block is offset by (0, TILE_H) from top-left tile's screen pos
      this.cameras.main.centerOn(this.originX + x, this.originY + y + TILE_H);
    }

    // Crumble warning flash
    this.renderCrumbleWarnings(_time);

    // Minimap player dots
    this.updateMinimapPlayers();

    // Key-hold auto-repeat
    if (this.currentPhase === RacePhase.Racing && Date.now() - this.lastSendTime >= SEND_INTERVAL) {
      if (this.keys.D?.isDown) this.sendMove('D');
      else if (this.keys.S?.isDown) this.sendMove('S');
      else if (this.keys.W?.isDown) this.sendMove('W');
      else if (this.keys.A?.isDown) this.sendMove('A');
    }

    // Live race timer
    if (this.currentPhase === RacePhase.Racing && this.raceStartTime > 0) {
      const elapsed = (Date.now() - this.raceStartTime) / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      this.timerText
        .setText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`)
        .setVisible(true);
    }
  }

  // ─── Terrain grid ──────────────────────────────────────────────────────

  private initEmptyTerrain(): void {
    this.localTerrain = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      this.localTerrain[y] = new Array(GRID_COLS).fill(Terrain.Normal);
    }
  }

  private drawTileGrid(): void {
    this.tileGfx = this.add.graphics();
    this.renderAllTiles();
    this.tileGfx.setDepth(-1);
  }

  private renderAllTiles(): void {
    this.tileGfx.clear();
    for (let ty = 0; ty < GRID_ROWS; ty++) {
      for (let tx = 0; tx < GRID_COLS; tx++) {
        this.renderTile(tx, ty);
      }
    }
  }

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

    this.tileGfx.lineStyle(1, TILE_OUTLINE, 0.08);
    this.tileGfx.strokePoints(pts, true);
  }

  private drawFinishLine(): void {
    this.finishGfx = this.add.graphics();
    this.renderFinishLine();
    this.finishGfx.setDepth(-0.5);
  }

  private renderFinishLine(): void {
    this.finishGfx.clear();
    for (let ty = FINISH_Y_MIN; ty <= FINISH_Y_MAX; ty++) {
      for (let tx = FINISH_X; tx < GRID_COLS; tx++) {
        const { x, y } = tileToScreen(tx, ty);
        const sx = this.originX + x;
        const sy = this.originY + y;
        const pts = this.rhombusPoints(sx, sy);

        const isCheck = (tx + ty) % 2 === 0;
        this.finishGfx.fillStyle(isCheck ? FINISH_COLOR : 0xffffff, 0.45);
        this.finishGfx.fillPoints(pts, true);

        this.finishGfx.lineStyle(1, 0xffffff, 0.2);
        this.finishGfx.strokePoints(pts, true);
      }
    }
  }

  // ─── Crumble warning flash ──────────────────────────────────────────────

  /** Flash a red/orange overlay on crumbling tiles. */
  private renderCrumbleWarnings(time: number): void {
    this.crumbleGfx.clear();

    // Clean up expired warnings (1.5s = crumble delay)
    for (const [key, start] of this.crumbleWarnings) {
      if (time - start > 1500) this.crumbleWarnings.delete(key);
    }

    if (this.crumbleWarnings.size === 0) return;

    const flash = Math.floor(time / 150) % 2 === 0;
    const alpha = flash ? 0.5 : 0.2;

    for (const [key] of this.crumbleWarnings) {
      const [tx, ty] = key.split(',').map(Number);
      const { x, y } = tileToScreen(tx, ty);
      const sx = this.originX + x;
      const sy = this.originY + y;
      const pts = this.rhombusPoints(sx, sy);

      this.crumbleGfx.fillStyle(0xff3300, alpha);
      this.crumbleGfx.fillPoints(pts, true);
    }
  }

  // ─── Minimap ────────────────────────────────────────────────────────────

  /** Initialize the minimap: a top-down rectangular view of the full track. */
  private initMinimap(): void {
    this.minimapBg = this.add.graphics().setScrollFactor(0).setDepth(9998);
    this.minimapPlayers = this.add.graphics().setScrollFactor(0).setDepth(9999);
  }

  /** Redraw the minimap terrain (called when localTerrain changes). */
  private renderMinimap(): void {
    const s = this.MINIMAP_SCALE;
    const p = this.MINIMAP_PAD;
    const mw = GRID_COLS * s;
    const mh = GRID_ROWS * s;
    const { width, height } = this.scale;
    const ox = width - mw - p - 8;
    const oy = height - mh - p - 8;

    this.minimapBg.clear();

    // Background
    this.minimapBg.fillStyle(0x000000, 0.7);
    this.minimapBg.fillRect(ox - p, oy - p, mw + p * 2, mh + p * 2);

    // Terrain pixels
    const terrainMiniColors: Record<number, number> = {
      [Terrain.Normal]:  0x3d6649,
      [Terrain.Slow]:    0x6a5228,
      [Terrain.Slide]:   0x76b8d8,
      [Terrain.Crumble]: 0xb0723c,
      [Terrain.Boost]:   0xc0a600,
      [Terrain.Hole]:    0x0c1018,
      [Terrain.Wall]:    0x555566,
      [Terrain.Button]:  0xdd3388,
    };

    for (let ty = 0; ty < GRID_ROWS; ty++) {
      for (let tx = 0; tx < GRID_COLS; tx++) {
        const t = this.localTerrain[ty]?.[tx] ?? 0;
        this.minimapBg.fillStyle(terrainMiniColors[t] ?? 0x3d6649, 1);
        this.minimapBg.fillRect(ox + tx * s, oy + ty * s, s, s);
      }
    }

    // Finish zone overlay
    this.minimapBg.fillStyle(FINISH_COLOR, 0.5);
    for (let ty = FINISH_Y_MIN; ty <= FINISH_Y_MAX; ty++) {
      for (let tx = FINISH_X; tx < GRID_COLS; tx++) {
        this.minimapBg.fillRect(ox + tx * s, oy + ty * s, s, s);
      }
    }

    // Border
    this.minimapBg.lineStyle(1, 0xffffff, 0.4);
    this.minimapBg.strokeRect(ox - 1, oy - 1, mw + 2, mh + 2);
  }

  /** Update player dots on the minimap (called every frame). */
  private updateMinimapPlayers(): void {
    const sc = this.MINIMAP_SCALE;
    const p = this.MINIMAP_PAD;
    const mw = GRID_COLS * sc;
    const mh = GRID_ROWS * sc;
    const { width, height } = this.scale;
    const ox = width - mw - p - 8;
    const oy = height - mh - p - 8;

    this.minimapPlayers.clear();

    for (const av of this.avatars.values()) {
      const color = SLOT_COLORS[av.slotIndex % SLOT_COLORS.length];
      const dotSize = av.slotIndex === this.mySlotIndex ? 3 : 2;
      this.minimapPlayers.fillStyle(color, 1);
      this.minimapPlayers.fillRect(
        ox + av.tileX * sc - Math.floor(dotSize / 2),
        oy + av.tileY * sc - Math.floor(dotSize / 2),
        dotSize, dotSize,
      );
    }
  }

  /** Draw type labels on each button's 2×2 tile area. */
  private renderButtonLabels(): void {
    // Destroy old labels
    for (const lbl of this.buttonLabels) lbl.destroy();
    this.buttonLabels = [];

    const typeNames: Record<number, string> = {
      [ButtonType.ClosePath]: 'WALL',
      [ButtonType.OpenHole]: 'HOLE',
      [ButtonType.TriggerSlide]: 'ICE',
    };

    for (const btn of this.buttons) {
      // Center of the 2×2 button
      const { x, y } = tileToScreen(btn.x, btn.y);
      const sx = this.originX + x;
      const sy = this.originY + y + TILE_H; // center of 2×2

      const label = this.add.text(sx, sy, typeNames[btn.type] ?? '?', {
        fontSize: '7px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#dd338888',
        padding: { x: 1, y: 0 },
      })
        .setOrigin(0.5, 0.5)
        .setDepth(isoDepth(btn.x + 1, btn.y + 1) + 0.2);

      this.buttonLabels.push(label);
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    // Immediate send on first keydown (auto-repeat handled in update)
    kb.on('keydown-W', () => this.sendMove('W'));
    kb.on('keydown-S', () => this.sendMove('S'));
    kb.on('keydown-A', () => this.sendMove('A'));
    kb.on('keydown-D', () => this.sendMove('D'));
    kb.on('keydown-H', () => {
      this.hatEquipped = !this.hatEquipped;
      const av = this.avatars.get(this.mySlotIndex);
      if (av) this.drawAvatarAt(av, av.tileX, av.tileY, true);
    });
    kb.on('keydown-SPACE', () => {
      if (this.room && this.currentPhase === RacePhase.Racing) {
        this.room.send('usePickup');
      }
    });
  }

  private sendMove(direction: 'W' | 'A' | 'S' | 'D'): void {
    if (this.currentPhase !== RacePhase.Racing) return;
    this.playerFacing = direction;
    this.lastSendTime = Date.now();
    if (this.room) this.room.send('move', direction);
  }

  // ─── Avatar management ─────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleSlotChange(slot: any, index: number): void {
    if (slot.occupied) {
      if (!this.avatars.has(index)) {
        this.avatars.set(index, this.createAvatar(index));
      }
      if (slot.sessionId === this.mySessionId) this.mySlotIndex = index;

      const av = this.avatars.get(index)!;
      av.tileX = slot.tileX as number;
      av.tileY = slot.tileY as number;
      av.playerName = slot.playerName ?? '';
      av.frozen = slot.frozen ?? false;
      av.penalized = slot.penalized ?? false;
      av.currentTerrain = slot.currentTerrain ?? Terrain.Normal;
      av.heldPickup = slot.heldPickup ?? null;
      av.shieldActive = slot.shieldActive ?? false;
      av.speedBoosted = slot.speedBoosted ?? false;
      av.stuck = slot.stuck ?? false;
      av.knockbackSlowed = slot.knockbackSlowed ?? false;
      this.drawAvatarAt(av, av.tileX, av.tileY, slot.sessionId === this.mySessionId);
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
      label: this.add.text(0, 0, '', { fontSize: '9px', color: '#ffffff' }).setOrigin(0.5, 1),
      statusLabel: this.add.text(0, 0, '', {
        fontSize: '7px', color: '#ffffff', fontStyle: 'bold',
        backgroundColor: '#00000088', padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1),
      tileX: SPAWN_X, tileY: SPAWN_Y,
      slotIndex, playerName: '',
      frozen: false, penalized: false,
      currentTerrain: Terrain.Normal,
      heldPickup: null, shieldActive: false, speedBoosted: false,
      stuck: false, knockbackSlowed: false,
    };
  }

  /**
   * Draw avatar centered on the 2×2 footprint.
   * The player position (tileX, tileY) is the top-left corner of the footprint.
   * Visual center is at tileToScreen(tileX, tileY) + (0, TILE_H).
   */
  private drawAvatarAt(
    av: AvatarGraphics, tileX: number, tileY: number, isLocal: boolean,
  ): void {
    // Center of 2×2 footprint in screen coords
    const { x, y } = tileToScreen(tileX, tileY);
    const cx = this.originX + x;
    const cy = this.originY + y + TILE_H; // center of the 2×2 diamond

    // Avatar block (same visual size as old single-tile avatar)
    const blockW = 20;
    const blockH = 28;
    const bx = cx;
    const by = cy + TILE_H; // bottom edge at diamond bottom

    av.body.clear();

    // Effect tint for local player
    let color = SLOT_COLORS[av.slotIndex % SLOT_COLORS.length];
    if (isLocal) {
      if (av.frozen || av.stuck) color = 0xff2222;
      else if (av.speedBoosted)  color = 0xffd700;
      else if (av.shieldActive)  color = 0x44ffff;
      else if (av.penalized || av.knockbackSlowed) color = 0x88ccff;
    }

    av.body.fillStyle(color, 1);
    av.body.fillRect(bx - blockW / 2, by - blockH, blockW, blockH);

    // Direction arrow (local only)
    if (isLocal) {
      const acx = bx;
      const acy = by - blockH / 2;
      const ar = 5;
      av.body.fillStyle(0x000000, 0.65);
      switch (this.playerFacing) {
        case 'W': av.body.fillTriangle(acx, acy - ar, acx - ar, acy + ar, acx + ar, acy + ar); break;
        case 'S': av.body.fillTriangle(acx, acy + ar, acx - ar, acy - ar, acx + ar, acy - ar); break;
        case 'A': av.body.fillTriangle(acx - ar, acy, acx + ar, acy - ar, acx + ar, acy + ar); break;
        case 'D': av.body.fillTriangle(acx + ar, acy, acx - ar, acy - ar, acx - ar, acy + ar); break;
      }
    }

    av.label.setPosition(bx, by - blockH - 2).setText(av.playerName || `P${av.slotIndex + 1}`);

    // Status indicator (local only)
    if (isLocal) {
      const { text, color: sc } = this.getStatusDisplay(av);
      av.statusLabel.setPosition(bx, by - blockH - 12).setText(text).setColor(sc).setVisible(text !== '');
    } else {
      av.statusLabel.setVisible(false);
    }

    // Hat (local only)
    av.hat.clear();
    if (isLocal && this.hatEquipped) {
      const hatW = 18;
      const crownH = 6;
      const brimH = 3;
      const hatTop = by - blockH - crownH - brimH;
      av.hat.fillStyle(0x9b59b6, 1);
      av.hat.fillRect(bx - hatW / 2 + 2, hatTop, hatW - 4, crownH);
      av.hat.fillRect(bx - hatW / 2, hatTop + crownH, hatW, brimH);
    }
  }

  private getStatusDisplay(av: AvatarGraphics): { text: string; color: string } {
    if (av.frozen)           return { text: 'FROZEN',    color: '#ff4444' };
    if (av.stuck)            return { text: 'STUCK',     color: '#ff4444' };
    if (av.speedBoosted)     return { text: 'SPEED!',    color: '#ffd700' };
    if (av.shieldActive)     return { text: 'SHIELD',    color: '#44ffff' };
    if (av.knockbackSlowed)  return { text: 'SLOWED',    color: '#88ccff' };
    if (av.penalized)        return { text: 'PENALTY',   color: '#88ccff' };

    switch (av.currentTerrain) {
      case Terrain.Slow:    return { text: 'SLOW',    color: '#c4a04a' };
      case Terrain.Crumble: return { text: 'CRUMBLE', color: '#e09050' };
      default:              return { text: '',        color: '#ffffff' };
    }
  }

  // ─── Network ───────────────────────────────────────────────────────────

  private async connectToRace(): Promise<void> {
    const name = window.prompt('Enter your name:', '')?.trim() || 'Player';

    const { Client } = await import('colyseus.js');
    const client = new Client('ws://localhost:3000');
    const room = await client.joinOrCreate('race', { playerName: name });
    this.room = room;
    this.mySessionId = room.sessionId;

    // Receive full terrain map, buttons, and pickups on join
    room.onMessage('mapData', (data: { map: number[][]; buttons: ButtonDef[]; pickups: PickupDef[] }) => {
      this.localTerrain = data.map;
      this.buttons = data.buttons;
      this.pickups = data.pickups;
      this.collectedPickupIds.clear();
      this.renderAllTiles();
      this.renderMinimap();
      this.renderButtonLabels();
      this.renderPickups();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    room.onMessage('state', (data: { phase: number; countdown: number; finishCountdown: number; startTime: number; slots: any[] }) => {
      const prevPhase = this.currentPhase;
      this.currentPhase = data.phase;

      if (data.phase === RacePhase.Racing && prevPhase !== RacePhase.Racing) {
        this.raceStartTime = data.startTime;
      }
      if (data.phase === RacePhase.Waiting && prevPhase === RacePhase.Finished) {
        this.handleRaceReset();
      }

      this.updatePhaseHud(data.phase, data.countdown, data.finishCountdown);
      data.slots.forEach((slot, index) => this.handleSlotChange(slot, index));
    });

    room.onMessage('terrainChange', (data: { tileX: number; tileY: number; terrain: number }) => {
      this.localTerrain[data.tileY][data.tileX] = data.terrain;
      this.renderAllTiles();
      this.renderMinimap();
    });

    room.onMessage('terrainReset', (data: { map: number[][]; buttons: ButtonDef[]; pickups: PickupDef[] }) => {
      this.localTerrain = data.map;
      this.buttons = data.buttons;
      this.pickups = data.pickups;
      this.collectedPickupIds.clear();
      this.slimeZones = [];
      this.renderAllTiles();
      this.renderMinimap();
      this.renderButtonLabels();
      this.renderPickups();
      this.renderSlimeZones();
    });

    room.onMessage('playerFinished', () => {});

    room.onMessage('raceResults', (data: { results: RaceResult[] }) => {
      this.showResults(data.results);
    });

    room.onMessage('crumbleWarning', (data: { tileX: number; tileY: number }) => {
      this.crumbleWarnings.set(`${data.tileX},${data.tileY}`, performance.now());
    });

    // Pickup events
    room.onMessage('pickupCollected', (data: { id: number }) => {
      this.collectedPickupIds.add(data.id);
      this.renderPickups();
    });
    room.onMessage('pickupUsed', () => {});
    room.onMessage('shieldUsed', () => {});
    room.onMessage('playerStuck', () => {});

    room.onMessage('slimePlaced', (data: { x: number; y: number; size: number }) => {
      this.slimeZones.push({ x: data.x, y: data.y, size: data.size });
      this.renderSlimeZones();
    });
    room.onMessage('slimeExpired', (data: { x: number; y: number }) => {
      this.slimeZones = this.slimeZones.filter(z => z.x !== data.x || z.y !== data.y);
      this.renderSlimeZones();
    });

    // Button events
    room.onMessage('buttonActivated', () => {});
    room.onMessage('buttonReverted', () => {});

    console.log('[IsoScene] connected to RaceRoom:', this.mySessionId);
  }

  private handleRaceReset(): void {
    this.resultsText.setVisible(false);
    this.timerText.setVisible(false);
    this.raceStartTime = 0;
    this.slimeZones = [];
    this.renderSlimeZones();
  }

  // ─── Pickup & slime rendering ──────────────────────────────────────────

  /** Color per pickup type for map markers. */
  private readonly PICKUP_COLORS: Record<number, number> = {
    0: 0x44ff44, // SpeedBoost — green
    1: 0x44ffff, // Shield — cyan
    2: 0xaaff00, // SlimeBomb — lime
    3: 0xff6644, // Knockback — red-orange
  };

  /** Render pickup markers on the map (uncollected only). */
  private renderPickups(): void {
    this.pickupGfx.clear();

    for (const p of this.pickups) {
      if (this.collectedPickupIds.has(p.id)) continue;

      const { x, y } = tileToScreen(p.x, p.y);
      const sx = this.originX + x;
      const sy = this.originY + y;
      const pts = this.rhombusPoints(sx, sy);

      this.pickupGfx.fillStyle(this.PICKUP_COLORS[p.type] ?? 0xffffff, 0.7);
      this.pickupGfx.fillPoints(pts, true);

      // Bright border
      this.pickupGfx.lineStyle(1, 0xffffff, 0.8);
      this.pickupGfx.strokePoints(pts, true);
    }
  }

  /** Render active slime zones as green overlays. */
  private renderSlimeZones(): void {
    this.slimeGfx.clear();

    for (const zone of this.slimeZones) {
      for (let dy = 0; dy < zone.size; dy++) {
        for (let dx = 0; dx < zone.size; dx++) {
          const { x, y } = tileToScreen(zone.x + dx, zone.y + dy);
          const sx = this.originX + x;
          const sy = this.originY + y;
          const pts = this.rhombusPoints(sx, sy);

          this.slimeGfx.fillStyle(0xaaff00, 0.4);
          this.slimeGfx.fillPoints(pts, true);
        }
      }
    }
  }

  /** Update the pickup HUD showing held item. */
  private updatePickupHud(): void {
    const localAv = this.avatars.get(this.mySlotIndex);
    if (!localAv || localAv.heldPickup === null) {
      this.pickupHudText.setVisible(false);
      return;
    }
    const name = PICKUP_NAMES[localAv.heldPickup] ?? '???';
    this.pickupHudText.setText(`[SPACE] ${name}`).setVisible(true);
  }

  // ─── HUD ───────────────────────────────────────────────────────────────

  private addHud(): void {
    this.add
      .text(8, 8, 'WASD move (hold) · SPACE use pickup · H hat', {
        fontSize: '10px', color: '#aabbcc', backgroundColor: '#00000055', padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0).setDepth(9999);

    const { width, height } = this.scale;

    // Pickup HUD (bottom-left)
    this.pickupHudText = this.add
      .text(8, height - 8, '', {
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
        backgroundColor: '#00000088', padding: { x: 10, y: 6 },
      })
      .setOrigin(0, 1).setScrollFactor(0).setDepth(9999).setVisible(false);

    this.phaseText = this.add
      .text(width / 2, 8, 'Waiting for players...', {
        fontSize: '18px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(9999);

    this.timerText = this.add
      .text(width - 16, 8, '00:00', {
        fontSize: '18px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(9999).setVisible(false);

    // Results overlay (centered, hidden until race ends)
    this.resultsText = this.add
      .text(width / 2, height / 2, '', {
        fontSize: '14px', color: '#ffffff', backgroundColor: '#000000dd',
        padding: { x: 20, y: 14 }, align: 'left',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(10000).setVisible(false);
  }

  private updatePhaseHud(phase: number, countdown: number, finishCountdown?: number): void {
    switch (phase) {
      case RacePhase.Waiting:
        this.phaseText.setText('Waiting for players...').setColor('#aaaaaa');
        this.timerText.setVisible(false);
        break;
      case RacePhase.Countdown:
        this.phaseText.setText(`Starting in ${countdown}...`).setColor('#ffdd44');
        this.timerText.setVisible(false);
        break;
      case RacePhase.Racing:
        if (finishCountdown && finishCountdown > 0) {
          this.phaseText.setText(`Race ends in ${finishCountdown}s!`).setColor('#ff8844');
        } else {
          this.phaseText.setText('Racing!').setColor('#44ff44');
        }
        break;
      case RacePhase.Finished:
        this.phaseText.setText('Race Over — Restarting...').setColor('#ff6666');
        break;
    }
  }

  private showResults(results: RaceResult[]): void {
    const lines: string[] = ['=== RACE RESULTS ===', ''];

    for (const r of results) {
      const pos = r.position > 0 ? `#${r.position}` : 'DNF';
      const time = r.position > 0 ? `${r.timeSeconds.toFixed(2)}s` : '---';
      const bonus = r.bonusPoints > 0 ? ` (+${r.bonusPoints} bonus)` : '';
      lines.push(`${pos}  ${r.playerName}  ${time}  ${r.totalScore}pts${bonus}`);
    }

    this.resultsText.setText(lines.join('\n')).setVisible(true);
  }

  // ─── Geometry ──────────────────────────────────────────────────────────

  private rhombusPoints(sx: number, sy: number): Array<{ x: number; y: number }> {
    return [
      { x: sx, y: sy },
      { x: sx + TILE_W / 2, y: sy + TILE_H / 2 },
      { x: sx, y: sy + TILE_H },
      { x: sx - TILE_W / 2, y: sy + TILE_H / 2 },
    ];
  }
}
