# Project Stage Analysis — Crazy Stuff

**Date:** 2026-03-22
**Stage:** Systems Design
**Author:** /project-stage-detect

---

## Completeness Overview

| Domain | Status | Detail |
|---|---|---|
| **Design** | 60% | 1 monolithic GDD (comprehensive), no per-system docs, no systems index |
| **Code** | 0% | No source files in `src/` |
| **Architecture** | 5% | Stack defined in GDD, ADRs created for Phaser 3, Colyseus, PostgreSQL |
| **Production** | 5% | Phased roadmap in GDD, sprint plan pending |
| **Tests** | 0% | Nothing yet |

---

## What Exists

- `design/gdd/crazy-stuff-gdd.md` — comprehensive monolithic GDD covering:
  - Vision, pillars, player experience goals
  - Avatar system (12 customization slots, 6 rarity tiers)
  - The Lobby — Crazy Town (6 key locations, seasonal themes)
  - Minigame — Burnout Run (5 terrain types, 5 pickups, 3 button types, scoring system)
  - Progression system (XP, seasonal leaderboard, Crazy Coins)
  - Economy & Monetization (free/paid gacha, seasonal/permanent store)
  - Player Housing (rooms, display cases, guestbook)
  - Social Systems (chat, voice, emotes, friends list)
  - Technical Architecture (full stack defined)
  - Phased Roadmap (Phases 0–5, ~30 tasks)

---

## Gaps Identified

1. **No systems index** — ~10 systems defined in the GDD but not formally decomposed. Resolved by: `/map-systems`.
2. **No per-system GDDs** — deferred by user preference; monolithic GDD is sufficient for initial build.
3. **No ADRs** — created at session time for Phaser 3, Colyseus, PostgreSQL.
4. **No sprint plans** — Phase 0 roadmap tasks exist in GDD; resolved by: `/sprint-plan`.
5. **No source code** — Phase 0 begins implementation.
6. **No tests** — expected at this stage.

---

## Approved Stack

| Layer | Technology |
|---|---|
| Client Renderer | Phaser 3 |
| Multiplayer Rooms | Colyseus |
| Backend API | Node.js + Express |
| Database | PostgreSQL |
| Cache / Session | Redis |
| Payments | Stripe |
| Platform | Browser (desktop-first) |

---

## Recommended Next Steps

1. `/map-systems` — decompose GDD into systems index ✓ (in progress)
2. `/sprint-plan` — convert Phase 0 tasks into tracked sprint
3. Begin Phase 0 implementation (isometric renderer, tile movement, basic avatar)

---

## Open Questions (from GDD §14)

- Lobby chat scope: global vs. proximity vs. both
- Button cooldown: 20s / 30s / 45s (needs playtesting)
- Max pickups per map: 3 / 5 / 7
- Crumble tile warning visual (shake vs. color change)
- Race queue fill: wait for 5 vs. fill with bots
- Gacha duplicate handling (dust/shard system?)
- Avatar collision in lobby (clip through vs. blocked)
- Voice chat in lobby (Phase 3 or later)
- Monetization age gate / gacha legal review before public launch
