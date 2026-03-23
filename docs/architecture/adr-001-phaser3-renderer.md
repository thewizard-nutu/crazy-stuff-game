# ADR-001: Phaser 3 as Client Renderer

**Date:** 2026-03-22
**Status:** Accepted
**Deciders:** Gabriel

---

## Context

Crazy Stuff is a browser-based isometric pixel art game requiring:
- Canvas/WebGL rendering in the browser (no native app)
- Isometric tile rendering with depth sorting
- Sprite sheet animation support for pixel art avatars
- Input handling (keyboard + mouse/touch)
- Scene management (lobby, race, UI layers)

## Decision

Use **Phaser 3** as the client-side game renderer.

## Rationale

- Mature 2D browser game framework with active maintenance
- First-class support for isometric tilemaps (via Phaser's tilemap system)
- Sprite sheet and animation system fits pixel art workflow
- Scene/camera system handles lobby ↔ race transitions cleanly
- Large community, extensive docs, TypeScript support
- Proven for browser MMO-style games at small-to-medium scale

## Alternatives Considered

- **PixiJS** — Lower level, more control, but no built-in tilemap/physics/input system; more boilerplate for this scope
- **Godot (HTML5 export)** — Overkill for a browser-first game; adds build complexity
- **Three.js** — 3D focused; isometric 2D is achievable but unnatural

## Consequences

- All client game code is Phaser 3 scenes and game objects
- Isometric depth sorting must be implemented manually (Y-sort, one centralized function per frame)
- Tile size confirmed at 32×16px standard isometric ratio (to be validated in prototyping)
- Client language: TypeScript
