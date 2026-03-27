/**
 * Shared terrain data — imported by both client and server.
 * Keep this file free of Phaser / Colyseus / Node dependencies.
 */

/** Terrain type identifiers. Values are stable across client and server. */
export const Terrain = {
  Normal:  0,
  Slow:    1,
  Slide:   2,
  Crumble: 3,
  Boost:   4,
  Hole:    5,
} as const;

export type TerrainType = (typeof Terrain)[keyof typeof Terrain];

/** Grid dimensions. */
export const GRID_COLS = 15;
export const GRID_ROWS = 15;
export const GRID_MAX = 14;

/** Spawn / respawn position. */
export const SPAWN_X = 7;
export const SPAWN_Y = 7;

/**
 * Hardcoded race track. Indexed [tileY][tileX].
 *
 *  0 Normal · 1 Slow · 2 Slide · 3 Crumble · 4 Boost · 5 Hole
 */
export const TERRAIN_MAP: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // row  0 — START
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // row  1
  [0,0,1,1,0,0,0,0,0,0,1,1,0,0,0], // row  2 — slow mud flanks centre lane
  [0,0,1,1,1,0,0,0,0,1,1,1,0,0,0], // row  3
  [0,0,0,0,0,4,4,4,4,0,0,0,0,0,0], // row  4 — first boost corridor
  [0,0,0,0,4,4,0,0,4,4,0,0,0,0,0], // row  5
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // row  6 — breather
  [0,0,0,2,2,2,2,2,2,2,2,0,0,0,0], // row  7 — ice / slide zone begins
  [0,0,2,2,2,2,2,2,2,2,2,2,0,0,0], // row  8
  [0,0,2,2,4,2,2,2,2,4,2,2,0,0,0], // row  9 — boost pads hidden inside ice
  [0,0,0,3,3,3,5,5,3,3,3,0,0,0,0], // row 10 — crumble bridge with hole pits
  [0,0,3,3,3,3,5,5,3,3,3,3,0,0,0], // row 11
  [0,0,0,3,0,3,0,3,0,3,0,0,0,0,0], // row 12 — crumble / normal gaps
  [0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // row 13 — final boost dash
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // row 14 — FINISH
];

/**
 * Look up terrain type at a tile position.
 * Returns Normal for out-of-bounds coordinates.
 */
export function terrainAt(tileX: number, tileY: number): TerrainType {
  if (tileX < 0 || tileX > GRID_MAX || tileY < 0 || tileY > GRID_MAX) {
    return Terrain.Normal;
  }
  return (TERRAIN_MAP[tileY]?.[tileX] ?? Terrain.Normal) as TerrainType;
}
