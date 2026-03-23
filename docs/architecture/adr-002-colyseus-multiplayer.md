# ADR-002: Colyseus for Multiplayer Room Management

**Date:** 2026-03-22
**Status:** Accepted
**Deciders:** Gabriel

---

## Context

Crazy Stuff requires:
- Real-time multiplayer race rooms (5 players, ~3 min sessions)
- Server-authoritative game state (no client trust for positions, trap activations)
- ~20 ticks/second state broadcast to all room clients
- Lightweight lobby presence sync (player positions in Crazy Town)
- Horizontal scaling path for future public launch

## Decision

Use **Colyseus** as the multiplayer room server.

## Rationale

- Purpose-built for real-time browser game rooms with WebSocket transport
- Schema-based state synchronization with delta compression (efficient for 20 tick/s)
- Server-authoritative by design — client sends input, server owns state
- Room lifecycle (create, join, leave, dispose) matches race session model exactly
- Node.js native — same runtime as the Express API, single language (TypeScript) across server
- Supports horizontal scaling via the Colyseus distributed mode when needed

## Alternatives Considered

- **Socket.io** — General-purpose, requires building room/state management from scratch
- **uWebSockets.js** — Lower level, faster, but significant custom infrastructure needed
- **Nakama** — Full game backend; heavier than needed, adds operational complexity

## Consequences

- Race room state (player positions, terrain, button cooldowns, scores) is owned by Colyseus server
- Client sends directional input only; server validates and applies movement
- Lobby presence (Crazy Town positions) is a separate lightweight Colyseus room — not game-state critical
- Trap/button activation is server-side only; no client prediction for traps
- Colyseus runs on the same DigitalOcean droplet as the API initially; separate when scaling
