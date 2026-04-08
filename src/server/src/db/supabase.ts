import { Pool } from 'pg';

// ─── PostgreSQL connection ──────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!DATABASE_URL) {
  console.warn('[DB] DATABASE_URL not set — database features disabled');
}

export const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Starter items seeded into every new player's inventory. */
const STARTER_ITEMS = [
  { item_type: 'upper_body', item_id: 'worn_tshirt', rarity: 'common' },
  { item_type: 'lower_body', item_id: 'blue_jeans', rarity: 'common' },
  { item_type: 'feet', item_id: 'beatup_sneakers', rarity: 'common' },
] as const;

// ─── Player CRUD ────────────────────────────────────────────────────────────

/** Create or get a player record by auth_id (UUID string). */
export async function getOrCreatePlayer(authId: string, username: string) {
  // Try to find existing player
  const existing = await pool.query(
    'SELECT * FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // Create new player
  const created = await pool.query(
    `INSERT INTO players (auth_id, username)
     VALUES ($1, $2)
     ON CONFLICT (auth_id) DO UPDATE SET auth_id = players.auth_id
     RETURNING *`,
    [authId, username],
  );

  if (created.rows.length === 0) {
    console.error('[DB] Failed to create player');
    return null;
  }

  const player = created.rows[0];

  // Seed starter inventory items
  for (const item of STARTER_ITEMS) {
    await pool.query(
      `INSERT INTO inventory (player_id, item_type, item_id, rarity)
       VALUES ($1, $2, $3, $4)`,
      [player.id, item.item_type, item.item_id, item.rarity],
    );
  }

  return player;
}

/** Award XP and coins after a race. */
export async function awardPostRace(authId: string, xp: number, coins: number, won: boolean) {
  const playerRes = await pool.query(
    'SELECT id, xp, coins, total_races, total_wins, level FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );

  if (playerRes.rows.length === 0) return null;
  const player = playerRes.rows[0];

  const newXp = player.xp + xp;
  const newCoins = player.coins + coins;
  const newLevel = Math.floor(newXp / 500) + 1;

  const updated = await pool.query(
    `UPDATE players SET xp = $1, coins = $2, level = $3,
       total_races = $4, total_wins = $5, updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [newXp, newCoins, newLevel, player.total_races + 1, player.total_wins + (won ? 1 : 0), player.id],
  );

  return updated.rows[0] ?? null;
}

/** Get player profile. */
export async function getPlayer(authId: string) {
  const res = await pool.query('SELECT * FROM players WHERE auth_id = $1 LIMIT 1', [authId]);
  return res.rows[0] ?? null;
}

/** Get the player's equipped character key. */
export async function getEquippedChar(authId: string): Promise<string> {
  const res = await pool.query(
    'SELECT equipped_char FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );
  return res.rows[0]?.equipped_char ?? 'male';
}

/** Set the player's equipped character key. Returns the new value or null on failure. */
export async function equipChar(authId: string, charKey: string): Promise<string | null> {
  const allowed = ['male', 'female', 'male-medium', 'female-medium', 'male-dark', 'female-dark'];
  if (!allowed.includes(charKey)) return null;

  const res = await pool.query(
    `UPDATE players SET equipped_char = $1, updated_at = NOW()
     WHERE auth_id = $2 RETURNING equipped_char`,
    [charKey, authId],
  );

  return res.rows[0]?.equipped_char ?? null;
}

/** Get player inventory. */
export async function getInventory(authId: string) {
  const playerRes = await pool.query(
    'SELECT id FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );
  if (playerRes.rows.length === 0) return [];

  const res = await pool.query(
    'SELECT * FROM inventory WHERE player_id = $1 ORDER BY obtained_at DESC',
    [playerRes.rows[0].id],
  );

  return res.rows;
}

/** Add item to inventory. */
export async function addItem(authId: string, itemType: string, itemId: string, rarity: string) {
  const playerRes = await pool.query(
    'SELECT id FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );
  if (playerRes.rows.length === 0) return null;

  const res = await pool.query(
    `INSERT INTO inventory (player_id, item_type, item_id, rarity)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [playerRes.rows[0].id, itemType, itemId, rarity],
  );

  return res.rows[0] ?? null;
}

/** Valid equipment slot types. */
export const EQUIPMENT_SLOTS = [
  'eyes_accessory', 'mouth_accessory', 'face_accessory',
  'upper_body', 'lower_body', 'head_accessory',
  'air_space', 'hand_1h', 'skin', 'hair', 'back', 'feet',
] as const;

export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];

/**
 * Equip an inventory item. Unequips any other item in the same item_type slot first.
 */
export async function equipItem(authId: string, inventoryItemId: string) {
  const playerRes = await pool.query(
    'SELECT id FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );
  if (playerRes.rows.length === 0) return null;
  const playerId = playerRes.rows[0].id;

  // Fetch the item being equipped to get its item_type
  const itemRes = await pool.query(
    'SELECT id, item_type FROM inventory WHERE id = $1 AND player_id = $2 LIMIT 1',
    [inventoryItemId, playerId],
  );
  if (itemRes.rows.length === 0) return null;
  const item = itemRes.rows[0];

  // Unequip any currently equipped item in the same slot
  await pool.query(
    `UPDATE inventory SET equipped = false
     WHERE player_id = $1 AND item_type = $2 AND equipped = true`,
    [playerId, item.item_type],
  );

  // Equip the target item
  await pool.query(
    'UPDATE inventory SET equipped = true WHERE id = $1 AND player_id = $2',
    [inventoryItemId, playerId],
  );

  return { ok: true };
}

/**
 * Unequip an inventory item.
 */
export async function unequipItem(authId: string, inventoryItemId: string) {
  const playerRes = await pool.query(
    'SELECT id FROM players WHERE auth_id = $1 LIMIT 1',
    [authId],
  );
  if (playerRes.rows.length === 0) return null;
  const playerId = playerRes.rows[0].id;

  await pool.query(
    'UPDATE inventory SET equipped = false WHERE id = $1 AND player_id = $2',
    [inventoryItemId, playerId],
  );

  return { ok: true };
}

/**
 * Find a player by email. Returns the full player row including password_hash, or null.
 */
export async function findPlayerByEmail(email: string) {
  const res = await pool.query(
    'SELECT * FROM players WHERE email = $1 LIMIT 1',
    [email],
  );
  return res.rows[0] ?? null;
}

/**
 * Find a player by Google sub (OAuth subject ID). Returns the full player row or null.
 */
export async function findPlayerByGoogleSub(googleSub: string) {
  const res = await pool.query(
    'SELECT * FROM players WHERE google_sub = $1 LIMIT 1',
    [googleSub],
  );
  return res.rows[0] ?? null;
}

/**
 * Create a player from email/password registration.
 * Seeds starter items automatically.
 */
export async function createPlayerWithPassword(
  email: string,
  username: string,
  passwordHash: string,
) {
  const created = await pool.query(
    `INSERT INTO players (email, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, username, passwordHash],
  );

  if (created.rows.length === 0) return null;
  const player = created.rows[0];

  // Seed starter inventory items
  for (const item of STARTER_ITEMS) {
    await pool.query(
      `INSERT INTO inventory (player_id, item_type, item_id, rarity)
       VALUES ($1, $2, $3, $4)`,
      [player.id, item.item_type, item.item_id, item.rarity],
    );
  }

  return player;
}

/**
 * Create (or get) a player from Google OAuth.
 * Seeds starter items on first creation.
 */
export async function getOrCreatePlayerByGoogle(
  googleSub: string,
  email: string,
  username: string,
) {
  // Check existing by google_sub
  const existing = await findPlayerByGoogleSub(googleSub);
  if (existing) return existing;

  // Check if email already registered (link accounts)
  const byEmail = await findPlayerByEmail(email);
  if (byEmail) {
    await pool.query(
      'UPDATE players SET google_sub = $1 WHERE id = $2',
      [googleSub, byEmail.id],
    );
    return { ...byEmail, google_sub: googleSub };
  }

  // Create new
  const created = await pool.query(
    `INSERT INTO players (google_sub, email, username)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [googleSub, email, username],
  );

  if (created.rows.length === 0) return null;
  const player = created.rows[0];

  // Seed starter items
  for (const item of STARTER_ITEMS) {
    await pool.query(
      `INSERT INTO inventory (player_id, item_type, item_id, rarity)
       VALUES ($1, $2, $3, $4)`,
      [player.id, item.item_type, item.item_id, item.rarity],
    );
  }

  return player;
}
