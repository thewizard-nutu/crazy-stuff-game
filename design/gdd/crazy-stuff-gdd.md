# Game Design Document — Crazy Stuff
**Version:** 0.1 (Draft)  
**Author:** Gabriel  
**Last Updated:** March 2026  
**Status:** Pre-Production

---

## Table of Contents
1. [Vision Statement](#1-vision-statement)
2. [Core Design Pillars](#2-core-design-pillars)
3. [Player Experience Goals](#3-player-experience-goals)
4. [Game Overview](#4-game-overview)
5. [Avatar System](#5-avatar-system)
6. [The Lobby — Crazy Town](#6-the-lobby--crazy-town)
7. [Minigame — Burnout Run](#7-minigame--burnout-run)
8. [Progression System](#8-progression-system)
9. [Economy & Monetization](#9-economy--monetization)
10. [Player Housing](#10-player-housing)
11. [Social Systems](#11-social-systems)
12. [Technical Architecture](#12-technical-architecture)
13. [Phased Roadmap](#13-phased-roadmap)
14. [Open Questions](#14-open-questions)

---

## 1. Vision Statement

**Crazy Stuff** is a browser-based isometric pixel art MMO social game where players express themselves through deep avatar customization, compete in chaotic short-form minigames, and collect rare items through a mix of skill, luck, and progression.

The game targets a casual-to-mid-core audience who want a fun, visually charming social space — a place they actually *want* to hang out in, not just a menu screen between matches.

**One-line pitch:** *A pixel art social hangout where you race your friends through burning obstacle courses and show off your drip.*

---

## 2. Core Design Pillars

### Compete
Every session has a winner. Short match length (3 min) makes losing sting just enough to want a rematch. Leaderboards and seasonal rankings give long-term competitive stakes.

### Collect
Items feel meaningful because they are rare. Gacha creates excitement. Seasonal exclusives create FOMO. The house system gives collections a place to live and be seen.

### Communicate / Express
The avatar is the player's identity. 10+ customization slots mean two players will rarely look the same. Emotes, housing, and lobby presence let players show who they are without saying a word.

---

## 3. Player Experience Goals

- A new player can create a unique-feeling character in under 5 minutes
- A match is fun even if you finish last
- Logging in daily feels rewarding (free gacha, seasonal check-in)
- Players talk about the game outside the game ("you should've seen what I did with that button")
- A veteran player's time investment is visible and respected

---

## 4. Game Overview

### Genre
Browser-based isometric pixel art MMO / social game with competitive minigames.

### Platform
Web browser (desktop-first, mobile later).

### Target Audience
- Primary: 18–30, casual-to-mid-core gamers
- Secondary: Friend groups, streamers, community builders

### Session Structure
```
Login
  └── Crazy Town (Lobby)
        ├── Free Daily Gacha
        ├── Visit friends' houses
        ├── Shop (seasonal + permanent items)
        ├── Chat / hang out
        └── Queue for Burnout Run
              └── 3-min race (5 players)
                    └── Post-match: XP, coins, leaderboard update
```

---

## 5. Avatar System

The avatar is the core identity of every player. Every slot is independently customizable.

### Customization Slots

| Slot | Description | Examples |
|------|-------------|---------|
| Skin | Color or texture of the character body | Palette colors, patterned textures |
| Hair | Hairstyle and color | Mohawk, ponytail, afro, buns |
| Head Accessory | Items worn on top of the head | Hats, crowns, helmets, flowers |
| Eyes Accessory | Worn over or around the eyes | Glasses, monocle, eye patch |
| Mouth Accessory | Worn around the mouth | Masks, fangs, pipe, candy |
| Face Accessory | Takes **both** eyes and mouth slots | Full face masks, visors, painted faces |
| Upper Body | Shirt, jacket, armor, etc. | Hoodie, tuxedo, knight armor |
| Lower Body | Pants, skirt, shorts | Jeans, kilt, cargo shorts |
| Feet | Shoes and boots | Sneakers, heels, bare feet |
| Back | Worn on the back | Wings, capes, backpacks, jetpacks |
| Air Space | Floats above/around the character | Drones, familiars, floating halo |
| Hand (1H) | One-hand item | Wand, phone, flower, weapon skin |

> **Note:** Face Accessory is mutually exclusive with Eyes Accessory and Mouth Accessory. The UI should clearly communicate the slot conflict and auto-clear conflicting slots on equip.

### Item Rarity Tiers

| Tier | Color | Availability |
|------|-------|-------------|
| Common | Gray | Gacha (high rate), store |
| Uncommon | Green | Gacha, store |
| Rare | Blue | Gacha (low rate), seasonal store |
| Epic | Purple | Gacha (very low rate), limited seasonal |
| Legendary | Gold | Gacha (ultra rare), event-exclusive |
| Crazy | Rainbow / Animated | Gacha (0.1% rate), never in store |

### Idle Animations
Each avatar has a default idle animation. Rare items may include custom idle overrides (e.g., a legendary familiar that floats in a unique pattern).

---

## 6. The Lobby — Crazy Town

The lobby is a persistent isometric pixel art village. All online players share the same space. It is not a menu — it is a place.

### Key Locations

| Location | Function |
|----------|----------|
| **Town Square** | Central spawn. Social hub, emotes, idle hanging out |
| **The Shop** | NPC shopkeeper. Access to seasonal store + permanent catalog |
| **Gacha Machine** | Daily free pull. Paid pulls available after daily |
| **Race Queue Board** | Sign up for Burnout Run. Shows current queue count |
| **Housing District** | Entrance to player house instances |
| **Leaderboard Wall** | Displays seasonal and all-time top players |

### Lobby Rules
- All players are visible to each other
- Movement: tile-based isometric (WASD or click-to-move)
- Chat: global and proximity-based (to be decided — see Open Questions)
- Players can emote at any time
- The lobby has ambient life: NPCs, weather cycles, seasonal decoration

### Seasonal Lobby Themes
Every month the lobby gets a visual reskin tied to the seasonal item drop. Examples: Halloween town in October, beach theme in July. This creates a reason to log in even outside of racing.

---

## 7. Minigame — Burnout Run

### Concept
5 players race through a 2.5D isometric obstacle course. The map has a chaotic, escalating environment (a burning building, a crumbling structure, a flooding street — theme rotates). Players must reach the finish line as fast as possible while navigating hazards and sabotaging rivals.

### Match Structure
- **Players per match:** 5
- **Target match length:** ~3 minutes
- **Map theme:** Rotates per season (Launch: burning building)

### Movement
- Tile-based isometric movement
- Directions: left, right, forward, backward (relative to the isometric camera)
- Movement speed: base speed with terrain modifiers

### Terrain Types

| Terrain | Effect |
|---------|--------|
| Normal | No modifier |
| Slow zone | -30% movement speed while on tile |
| Slide | Player slides forward 2–3 tiles, cannot stop |
| Crumble | Tile collapses 1.5s after first step, becomes a hole |
| Boost pad | +50% speed for 1.5s |

### Holes & Respawn
- Falling into a hole triggers a 3-second respawn timer
- Player respawns at last checkpoint before the hole
- On respawn: 25% movement speed penalty for 3 seconds
- Visual indicator: ghost/transparent character during respawn

### Interactive Buttons
- Scattered across the map on specific tiles
- Activated by walking over them
- Each button does one of:
  - **Close a path** (wall appears, blocking a route — forces a detour)
  - **Open a hole** (floor disappears on a tile ahead)
  - **Trigger a slide zone** (converts a stretch of tiles to slide terrain)
- Buttons have a cooldown (suggested: 20–30s) before re-activation
- A button's effect applies to ALL players — including the activator
- Players must decide: is the detour to hit that button worth it?

### Pickups
Pickups are items on specific map tiles that auto-collect on step.

| Pickup | Effect | Duration |
|--------|--------|----------|
| Speed Boost | +40% movement speed | 4 seconds |
| Shield | Immune to the next trap/hole | One hit |
| Ghost | Pass through other players (no collision) | 3 seconds |
| Slime Bomb | Drops a slime zone on your current tile. Any player stepping on it is stuck (cannot move) for 2 seconds | Persists 10s |
| Knockback Bomb | Explodes on pickup, bumping all players within 2 tiles away from you + slows them 30% for 2–3 seconds | Instant, radius |

> Pickup spawn locations are fixed per map but rotate between 3–4 preset configurations per match to keep it unpredictable.

### Scoring System
All three systems combine into a final match score:

**Finish Position Points:**
| Position | Points |
|----------|--------|
| 1st | 100 |
| 2nd | 75 |
| 3rd | 55 |
| 4th | 35 |
| 5th | 20 |
| DNF | 5 |

**Bonus Points:**
| Action | Points |
|--------|--------|
| Trap triggered (button activated) | +10 per trap |
| Pickup collected | +5 per pickup |
| Another player falls in your trap | +15 |
| Finish under 2:00 | +25 speed bonus |
| Finish under 2:30 | +10 speed bonus |

**Final Match Score** = Position Points + Bonus Points

### Post-Match Screen
- Final standings with scores
- "Best moment" highlight (most chaos-causing event)
- XP gained, coins gained
- Leaderboard position change
- Rematch button (same 5 players, new map config)

---

## 8. Progression System

### Player Level (XP)
- XP earned from every match regardless of finish position
- Level unlocks cosmetic rewards (common/uncommon items at specific milestones)
- Level is permanent, visible on player profile and above avatar in lobby
- No pay-to-level mechanic — XP is purely earned through play

### XP Per Match (Approximate)
| Result | Base XP |
|--------|---------|
| 1st place | 120 |
| 2nd–3rd | 90 |
| 4th–5th | 70 |
| DNF | 30 |
| Bonus XP | +5 per bonus action (same as scoring) |

### Seasonal Leaderboard
- Season = 1 calendar month
- Ranked by cumulative match scores across the season
- Top 10 at season end receive exclusive legendary cosmetic (season-specific, never returns)
- All players who participated get a season participation badge
- Leaderboard resets at start of each new season

### Soft Currency — Crazy Coins
- Earned from matches (amount based on final score, roughly 1 coin per 2 score points)
- Earned from daily login bonus
- Used to purchase items in the permanent store catalog
- Cannot be purchased directly with real money (real money goes to premium currency or direct store items)

---

## 9. Economy & Monetization

### Currency Types

| Currency | How Earned | How Spent |
|----------|-----------|-----------|
| Crazy Coins (soft) | Matches, daily login | Permanent store catalog |
| Real Money (USD) | Purchase | Gacha pulls, seasonal items, premium cosmetics |

### Daily Free Gacha
- 1 free pull per day, resets at midnight UTC
- Wide item pool: all rarities included but weighted (Common 50%, Uncommon 30%, Rare 15%, Epic 4%, Legendary 0.9%, Crazy 0.1%)
- Free pull does NOT carry over (use it or lose it — creates daily login habit)

### Paid Gacha
- After daily pull is used: additional pulls available for real money
- Suggested pricing: $1.99 per pull, $8.99 for 5 pulls, $16.99 for 10 pulls
- 10-pull guarantees at least 1 Rare or above
- Pity system: after 50 pulls without Epic+, next pull is guaranteed Epic or above
- Pity counter persists across sessions, resets on Epic+ pull

### Seasonal Store
- Refreshes every calendar month
- 10–15 exclusive items per season (all rarities)
- Items are NEVER re-sold after the season ends (drives FOMO legitimately)
- Priced individually in real money or as a seasonal bundle
- Seasonal items can also appear in that month's gacha pool at reduced rates

### Permanent Store
- Always-available catalog of common/uncommon/rare items
- Purchased with Crazy Coins (soft currency)
- Expands over time as new content is added

### Monetization Ethics
- No pay-to-win: all purchased items are cosmetic only
- Race performance is entirely skill-based — no purchasable advantages
- All items obtainable free (given enough time/gacha pulls) except seasonal exclusives
- Gacha odds are clearly disclosed on the pull screen

---

## 10. Player Housing

Each player owns a private house instance accessible from the Housing District in the lobby.

### Features
- Isometric room(s) the player can decorate
- Furniture and decor items obtained through gacha, store, or level rewards
- Display cases for showing off rare cosmetics and trophies
- Trophy shelf: race achievements, seasonal badges, leaderboard placements auto-displayed
- Visitors can enter your house (you can toggle visitor access on/off)
- Guestbook: visitors can leave a short message

### House Progression
- Starter house: 1 room, basic furniture
- Level milestones unlock additional rooms or house exterior styles
- No premium paywall on house size — it expands through play

### Purpose in the Loop
The house serves as a "trophy room" that gives collectibles a reason to exist beyond just wearing them. Rare items you're not currently wearing can be displayed. This deepens the collect pillar.

---

## 11. Social Systems

### Chat
- Global lobby chat (text)
- Proximity chat (players near each other in the lobby)
- Race chat: text only during pre-race lobby, voice during the race

### Voice Chat
- In-race only, 5-player room
- Push-to-talk (default) with option to toggle open mic
- Mute per player available
- Voice chat in the main lobby: deferred to a later phase

### Emotes
- Avatar emotes triggered by hotkey or menu
- Common emotes available to all players
- Rare/legendary emotes obtainable through gacha and seasonal store
- Emotes play in the lobby and in the pre-race waiting area

### Friends & Social Graph
- Friends list with online status
- Invite friend to race (if a slot is available in the current queue)
- Visit friend's house directly from friends list
- Block player (removes from visibility and chat)

---

## 12. Technical Architecture

### Recommended Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend renderer | Phaser 3 | Mature 2D/isometric browser game framework, good pixel art support |
| Multiplayer rooms | Colyseus | Purpose-built for real-time browser game rooms, handles 5-player sessions cleanly |
| Backend API | Node.js + Express | Handles auth, inventory, gacha logic, store |
| Database | PostgreSQL | Persistent player data: accounts, inventory, house state, progression |
| Cache / session state | Redis | Room state, leaderboard cache, rate limiting |
| Payments | Stripe | Gacha pulls, seasonal item purchases |
| Hosting | DigitalOcean (existing droplet) | NYC3, sufficient for friend group scale |
| Asset pipeline | Aseprite → PNG sprite sheets | Standard pixel art workflow |

### Isometric Rendering Notes
- **Tile size:** 32×16px (standard isometric tile ratio) — to be confirmed during prototyping
- **Depth sorting:** Y-sort based on tile position. Sprites at higher Y values render in front. This must be consistent and centralized — one sort function, called every frame.
- **Camera:** Fixed isometric angle, no rotation
- **Movement:** 4-directional tile-based. Each move is one tile step. Animation plays during the step, character snaps to new tile on completion.

### Multiplayer Architecture
- Colyseus handles the race room (authoritative server-side state)
- Lobby presence (player positions in Crazy Town) handled separately — lightweight positional sync, not game-state critical
- Race rooms: server authoritative. Client sends input (direction pressed), server validates and updates position. Clients receive state updates at ~20 ticks/second.
- Button/trap state is server-side only. No client prediction for trap activation.

### Scalability Notes (Early Stage)
- Existing DigitalOcean droplet (NYC3) handles the initial friend group load
- When going public: separate game server from trading bots, consider a Frankfurt droplet for European players (already planned)
- Colyseus supports horizontal scaling when needed

---

## 13. Phased Roadmap

### Phase 0 — Foundation (Weeks 1–3)
- [ ] Project setup: repo, Claude Code Game Studios template configured
- [ ] Basic Phaser 3 isometric renderer: tiles, depth sort, player sprite
- [ ] Single player movement (keyboard input, tile-based, 4 directions)
- [ ] Basic character with 2–3 customization slots (proof of concept)

### Phase 1 — Race Prototype (Weeks 4–7)
- [ ] Colyseus integration: 2-player race room (localhost)
- [ ] Full tile-based race map (1 track, burning building theme)
- [ ] Terrain types: normal, slow, slide, crumble, holes
- [ ] Respawn system (3s timer, 25% slow on return)
- [ ] One interactive button (open hole)
- [ ] Basic scoring (position only)
- [ ] Playable with friends via hosted server

### Phase 2 — Content & Loop (Weeks 8–12)
- [ ] Full 5-player race support
- [ ] All button types (close path, open hole, trigger slide)
- [ ] Pickup system (speed boost + 1–2 others)
- [ ] Full scoring system (position + bonuses)
- [ ] Post-match screen
- [ ] XP and Crazy Coins earn flow
- [ ] Basic player account system (login/register)
- [ ] Persistent inventory (items stored, equippable)

### Phase 3 — Lobby & Social (Weeks 13–18)
- [ ] Crazy Town lobby (isometric village, persistent world)
- [ ] All lobby locations (shop, gacha machine, queue board, leaderboard wall)
- [ ] Full avatar customization (all 12 slots)
- [ ] Lobby chat (text)
- [ ] In-race voice chat (WebRTC, 5-player)
- [ ] Friends list + online status

### Phase 4 — Economy & Retention (Weeks 19–24)
- [ ] Daily free gacha (full item pool, rarity weights)
- [ ] Paid gacha (Stripe integration, pity system)
- [ ] Permanent store (Crazy Coins)
- [ ] Seasonal store (first season)
- [ ] Player housing (basic version: 1 room, display items)
- [ ] Seasonal leaderboard (first season)
- [ ] Player level system + milestone rewards

### Phase 5 — Polish & Public Launch (Weeks 25+)
- [ ] Full lobby seasonal theming system
- [ ] House expansion (multiple rooms, guestbook)
- [ ] Second minigame track (new theme)
- [ ] Emote system
- [ ] Mobile layout (responsive)
- [ ] Community launch (Discord, social presence)

---

## 14. Open Questions

These decisions are deferred — flag them during relevant build phases.

| Question | Options | Notes |
|----------|---------|-------|
| Lobby chat scope | Global only vs. proximity vs. both | Proximity is more MMO-feel but harder to implement |
| Button cooldown duration | 20s / 30s / 45s | Needs playtesting — too short = spammy, too long = irrelevant |
| Max pickups per map | 3 / 5 / 7 | Affects chaos level — start conservative |
| Crumble tile warning | Shake animation? Color change? | Players need some tell before it collapses |
| Race queue fill | Wait for 5 vs. fill with bots | For small player count early on, bots prevent waiting |
| Gacha duplicate handling | Dust/shard system? Sell back? | Needs design once item pool is large enough |
| Avatar collision in lobby | Players clip through each other vs. blocked | Isometric collision in dense lobby is tricky |
| Voice chat in lobby | Phase 3 or later? | WebRTC adds complexity — defer unless strongly demanded |
| Monetization age gate | ESRB / gacha regulations | Some regions regulate gacha as gambling — legal review needed before public launch |

---

*This document is a living artifact. Update it as decisions are made. Every significant design change should be reflected here before implementation begins.*
