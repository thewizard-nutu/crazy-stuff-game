import Phaser from 'phaser';
import { type AuthState } from './auth';

const PL_CHAR_KEYS = ['male', 'female', 'male-medium', 'female-medium', 'male-dark', 'female-dark'];
const PL_DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

const PIXELLAB_DIR_MAP: Record<string, { sheetSuffix: string }> = {
  S:  { sheetSuffix: '_south' },
  SA: { sheetSuffix: '_south-west' },
  A:  { sheetSuffix: '_west' },
  WA: { sheetSuffix: '_north-west' },
  W:  { sheetSuffix: '_north' },
  WD: { sheetSuffix: '_north-east' },
  D:  { sheetSuffix: '_east' },
  SD: { sheetSuffix: '_south-east' },
};

const MOVE_SPEED = 180;
const CHAR_KEY = 'male';
const INTERACT_DIST = 100;

export class LobbyScene extends Phaser.Scene {
  private authState: AuthState | null = null;
  private bgMusic: Phaser.Sound.BaseSound | null = null;

  private player!: Phaser.GameObjects.Sprite;
  private playerX = 0;
  private playerY = 0;
  private playerFacing = 'SD';

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private eKey!: Phaser.Input.Keyboard.Key;

  private buildingX = 0;
  private buildingY = 0;
  private ePrompt!: Phaser.GameObjects.Text;

  private groundBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  private profileHud: HTMLDivElement | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: { authState?: AuthState; bgMusic?: Phaser.Sound.BaseSound }): void {
    this.authState = data.authState ?? null;
    this.bgMusic = data.bgMusic ?? null;
  }

  preload(): void {
    this.load.image('lobby_ground', '/tiles/lobby_ground.png');

    for (const charKey of PL_CHAR_KEYS) {
      for (const dir of PL_DIRS) {
        if (!this.textures.exists(`${charKey}_${dir}`)) {
          this.load.spritesheet(`${charKey}_${dir}`, `/sprites/characters/${charKey}/walk_${dir}.png`, { frameWidth: 92, frameHeight: 92 });
        }
        if (!this.textures.exists(`${charKey}_idle_${dir}`)) {
          this.load.spritesheet(`${charKey}_idle_${dir}`, `/sprites/characters/${charKey}/idle_${dir}.png`, { frameWidth: 92, frameHeight: 92 });
        }
      }
    }
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Ground — fit to screen, no overflow
    const cx = width / 2;
    const cy = height / 2;

    this.add.image(cx, cy, 'lobby_ground').setDisplaySize(width, height).setDepth(-1);

    this.groundBounds = {
      left: 40,
      right: width - 40,
      top: 40,
      bottom: height - 40,
    };

    // Reduce music volume when entering lobby
    if (this.bgMusic) {
      try { (this.bgMusic as any).setVolume(0.15); } catch { /* ignore */ }
    }

    // Building on the right
    this.buildingX = width - 120;
    this.buildingY = cy;
    this.drawBuilding(this.buildingX, this.buildingY);

    // Register animations
    this.registerAnimations();

    // Player
    this.playerX = width / 3;
    this.playerY = height / 2;
    this.player = this.add.sprite(this.playerX, this.playerY, `${CHAR_KEY}_south-east`)
      .setScale(0.75)
      .setOrigin(0.5, 0.85)
      .setDepth(10);
    this.player.play(`${CHAR_KEY}_idle_SD`);

    // E prompt
    this.ePrompt = this.add.text(this.buildingX, this.buildingY - 90, '[E] Enter Race', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#ffdd44',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(20).setAlpha(0);

    this.tweens.add({
      targets: this.ePrompt,
      scaleY: 1.08,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Input
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.eKey.on('down', () => {
      const dist = Phaser.Math.Distance.Between(this.playerX, this.playerY, this.buildingX, this.buildingY);
      if (dist <= INTERACT_DIST) this.enterRace();
    });

    // WASD hint
    this.add.text(10, height - 30, 'WASD to move · E to interact', {
      fontSize: '12px', fontFamily: 'monospace', color: '#555',
    }).setScrollFactor(0).setDepth(100);

    // Profile HUD
    const authId = this.authState?.session?.user?.id;
    if (authId) this.createProfileHud(authId).catch(() => {});

    // Cleanup
    this.events.on('shutdown', () => this.cleanupScene());
    this.events.on('destroy', () => this.cleanupScene());
  }

  update(_time: number, delta: number): void {
    const speed = MOVE_SPEED * (delta / 1000);

    const w = this.keys.W.isDown;
    const a = this.keys.A.isDown;
    const s = this.keys.S.isDown;
    const d = this.keys.D.isDown;

    let dx = 0, dy = 0;
    if (w) dy -= 1;
    if (s) dy += 1;
    if (a) dx -= 1;
    if (d) dx += 1;

    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      if (dx !== 0 && dy !== 0) {
        const norm = Math.SQRT2 / 2;
        dx *= norm;
        dy *= norm;
      }

      this.playerX = Phaser.Math.Clamp(this.playerX + dx * speed, this.groundBounds.left, this.groundBounds.right);
      this.playerY = Phaser.Math.Clamp(this.playerY + dy * speed, this.groundBounds.top, this.groundBounds.bottom);
      this.player.setPosition(this.playerX, this.playerY);

      const dir = this.resolveDir(w, a, s, d);
      const walkKey = `${CHAR_KEY}_walk_${dir}`;
      if (dir !== this.playerFacing || !this.player.anims.isPlaying || this.player.anims.currentAnim?.key.includes('idle')) {
        this.playerFacing = dir;
        this.player.play(walkKey, true);
      }
    } else {
      const idleKey = `${CHAR_KEY}_idle_${this.playerFacing}`;
      if (!this.player.anims.currentAnim?.key.includes('idle')) {
        this.player.play(idleKey, true);
      }
    }

    // E prompt
    const dist = Phaser.Math.Distance.Between(this.playerX, this.playerY, this.buildingX, this.buildingY);
    this.ePrompt.setAlpha(dist <= INTERACT_DIST ? 1 : 0);
  }

  private resolveDir(w: boolean, a: boolean, s: boolean, d: boolean): string {
    if (w && d)  return 'WD';
    if (w && a)  return 'WA';
    if (s && d)  return 'SD';
    if (s && a)  return 'SA';
    if (w)       return 'W';
    if (s)       return 'S';
    if (a)       return 'A';
    if (d)       return 'D';
    return this.playerFacing;
  }

  private drawBuilding(bx: number, by: number): void {
    const g = this.add.graphics().setDepth(5);

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillRect(bx - 55 + 6, by - 80 + 8, 110, 160);

    // Building body
    g.fillStyle(0x2a2a4a, 1);
    g.fillRect(bx - 55, by - 80, 110, 160);

    // Roof
    g.fillStyle(0x3a3a6a, 1);
    g.fillRect(bx - 55, by - 80, 110, 18);

    // Door
    g.fillStyle(0x1a1a3a, 1);
    g.fillRect(bx - 20, by + 20, 40, 60);
    g.fillStyle(0xffcc44, 0.15);
    g.fillRect(bx - 18, by + 22, 36, 56);
    g.fillStyle(0xffcc44, 1);
    g.fillCircle(bx + 12, by + 52, 3);

    // Neon sign
    g.lineStyle(2, 0xff4466, 1);
    g.strokeRect(bx - 45, by - 68, 90, 24);

    this.add.text(bx, by - 56, 'CRAZY RACE', {
      fontSize: '12px', fontFamily: 'monospace', color: '#ff4466', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(6);
  }

  private registerAnimations(): void {
    const allDirs = ['S', 'SA', 'A', 'WA', 'W', 'WD', 'D', 'SD'];
    for (const charKey of PL_CHAR_KEYS) {
      for (const dir of allDirs) {
        const suffix = PIXELLAB_DIR_MAP[dir].sheetSuffix;
        const walkKey = `${charKey}_walk_${dir}`;
        const idleKey = `${charKey}_idle_${dir}`;

        if (!this.anims.exists(walkKey)) {
          this.anims.create({
            key: walkKey,
            frames: this.anims.generateFrameNumbers(`${charKey}${suffix}`, { start: 0, end: 5 }),
            frameRate: 10,
            repeat: -1,
          });
        }
        if (!this.anims.exists(idleKey)) {
          this.anims.create({
            key: idleKey,
            frames: this.anims.generateFrameNumbers(`${charKey}_idle${suffix}`, { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1,
          });
        }
      }
    }
  }

  private enterRace(): void {
    this.cameras.main.flash(300, 255, 200, 50);
    this.time.delayedCall(400, () => {
      this.scene.start('IsoScene', { authState: this.authState });
    });
  }

  private cleanupScene(): void {
    if (this.profileHud) { this.profileHud.remove(); this.profileHud = null; }
  }

  private async createProfileHud(authId: string): Promise<void> {
    try {
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      const port = window.location.port || (protocol === 'https:' ? '443' : '80');
      const apiPort = (port === '8080' || port === '5173') ? '3000' : port;
      const resp = await fetch(`${protocol}//${host}:${apiPort}/api/player/${authId}`);
      if (!resp.ok) return;
      const player = await resp.json();
      this.renderProfileHud(player);
    } catch { /* skip */ }
  }

  private renderProfileHud(player: { username: string; level: number; xp: number; coins: number }): void {
    if (this.profileHud) this.profileHud.remove();
    const hud = document.createElement('div');
    hud.id = 'profile-hud';
    hud.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 5000;
      background: rgba(0,0,0,0.7); border: 1px solid #444; border-radius: 6px;
      padding: 8px 14px; font-family: monospace; color: #eee; font-size: 13px;
      pointer-events: none;
    `;
    hud.innerHTML = `
      <div style="font-weight: bold; color: #ffdd44; margin-bottom: 4px;">Lv.${player.level} ${player.username}</div>
      <div style="font-size: 11px; color: #aaa;">XP: ${player.xp} &nbsp; Coins: ${player.coins}</div>
    `;
    document.body.appendChild(hud);
    this.profileHud = hud;
  }
}
