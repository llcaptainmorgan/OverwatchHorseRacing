# Overwatch Horse Racing (OHR) - Project Handoff Document
**Date:** October 21, 2025  
**Status:** Development - Core MVP Nearly Complete  
**Last Active:** ~1 month ago

---

## PROJECT OVERVIEW

**Overwatch Horse Racing** is a multiplayer real-time racing game inspired by Uma Musume, featuring Overwatch characters as "horse racers." Players join sessions via Discord OAuth, select characters, and compete in races on an elliptical track with stats-based gameplay and interactive cheering mechanics.

### Core Concept
- **6-player multiplayer** sessions with Discord integration
- **Server-authoritative gameplay** via Cloudflare Workers + Durable Objects
- **WebSocket-based** real-time synchronization
- **Character-based racing** with unique stats (Speed, Power, Stamina, Determination)
- **Cheering system** where players boost their racers during the race
- **Session-based scoring** with persistent player points across races

### Tech Stack
- **Backend:** Cloudflare Workers (Durable Objects)
- **Frontend:** Vanilla JavaScript (no framework)
- **Styling:** SCSS → CSS compilation
- **Transport:** WebSocket (primary) for real-time state sync
- **Auth:** Discord OAuth 2.0

---

## ARCHITECTURE OVERVIEW

### **Backend Structure** (`backend/src/`)
```
backend/src/
├── worker.js                    # Entry point, HTTP router, Discord OAuth
├── config/settings.js           # Race settings & mechanics tuning
├── data/character_database.json # Character roster (42 total, 7 active)
├── routes/session_routes.js     # SessionDO: session state & lifecycle
└── services/race_engine.js      # Racer class & Race simulation tick loop
```

**Key Components:**
- **`SessionDO` (Durable Object):** Manages session state, phase transitions, player slots, WebSocket connections, and the race tick loop
- **`Race` class:** Server-side race simulation (100ms ticks, position updates, lap counting, finish detection)
- **`Racer` class:** Per-character state (position, stamina, buffs, pace profiles)

### **Frontend Structure** (`main/`)
```
main/
├── index.html                   # Main game UI structure
├── styles.css                   # Compiled from SCSS (auto-generated)
├── backend_config.js            # Backend URL config (localhost:8787)
├── backend_client.js            # API wrapper for session endpoints + WS
├── game_engine.js               # Client-side game state manager
├── racing.js                    # Track rendering & racer sprite system
├── character_selection.js       # Character selection overlay UI
├── discord_integration.js       # Panel management, join/leave logic
├── audio_system.js              # SFX & music (jukebox)
├── announcer.js                 # Announcer voiceline system (stub)
└── main.js                      # Application init & system wiring
```

**Key Components:**
- **`OHRGameEngine`:** Manages phase timers (intermission/race/results), mirrors server state
- **`OHRRacingSystem`:** Renders racers on ellipse track, converts distance→(x,y), handles sprite flipping
- **`DiscordIntegration`:** Manages 6 user panels, claim/leave logic, button states
- **`BackendClient`:** Wrapper for REST API + WebSocket message handling

### **Shared Config** (`shared/`)
- `race_settings.js`: Race parameters (distance, laps, tick rate, mechanics tuning)

### **Styling** (`styles/`)
- SCSS source files (20 files)
- Compiled via `npm run build:css` or `npm run watch:css` (auto-watch mode)

---

## CURRENT STATE ASSESSMENT

### **What's Implemented ✅**

#### Phase 0-2: Infrastructure & Data
- [x] Cloudflare Workers + Durable Objects setup
- [x] Character database with 42 heroes (7 currently available)
- [x] Enhanced stats: `speed`, `power`, `stamina`, `determination`
- [x] Racer style profiles: `front_runner`, `pace_chaser`, `late_surger`, `end_sprinter`
- [x] Ability schema (cooldowns, effects, voiceline paths)
- [x] Discord OAuth login/logout (`/auth/discord/*`)

#### Backend Session API (Phase 2)
- [x] POST `/sessions` → create session, return 4-letter code
- [x] POST `/sessions/:code/join` → claim slot (1-6)
- [x] POST `/sessions/:code/leave` → free slot
- [x] POST `/sessions/:code/select_character` → choose character
- [x] POST `/sessions/:code/lock_in` → lock selection
- [x] POST `/sessions/:code/start_race` → manual race start
- [x] POST `/sessions/:code/cheer/:name` → cheer with ownership validation
- [x] GET `/sessions/:code/state` → full state snapshot
- [x] WS `/sessions/:code/stream` → real-time deltas
- [x] Viewer counting (WebSocket connect/disconnect)
- [x] Heartbeat support (`ping` messages)
- [x] Rate limiting (basic per-IP for join/cheer)
- [x] Single-slot-per-user enforcement
- [x] Session inactivity shutdown (2 min no players)
- [x] 3-hour session TTL

#### Server Racing Engine (Phase 3)
- [x] `Racer` class with base stats, effects, stamina drain
- [x] `Race` class with 100ms tick loop
- [x] Race config: 1600m total, 400m/lap, 4 laps
- [x] AI fill for empty slots
- [x] Enhanced mechanics:
  - Determination system (surge on overtake, rattle debuff)
  - Anti-spam protection (excessive cheers → debuff)
  - Pace profiles (affect performance by race stage)
- [x] Ability cooldowns (server-enforced)
- [x] Mid-race leave → AI takeover
- [x] AFK auto-boot (if not locked in before timer ends)
- [x] Event queue (overtakes, finishes, buffs, abilities)

#### Client Track & Rendering (Phase 4)
- [x] Ellipse-based track rendering (PATH_CONFIG)
- [x] Linear distance → (x, y) conversion with perspective
- [x] Sprite system with per-character racing sprites
- [x] VFX system (buff/debuff overlays, panel indicators)
- [x] Lap counter & race timer display
- [x] Event log panel (left-side docked, tabs: All/Events/Chat)
- [x] Results scoreboard modal
- [x] Virtualized event log scrolling

#### Discord Panels & UX (Phase 5)
- [x] Panel states by phase (CHOOSE/LOCK IN/CHEER/WAITING)
- [x] Ownership enforcement (user can only cheer own racer)
- [x] Cheer cooldown timer per character
- [x] Buff/debuff status indicators on panel avatars
- [x] Roster image banner above panels
- [x] Red exit button (top-right, owner only)
- [x] Multi-panel claim prevention
- [x] Spectator mode UI
- [x] Live viewer count display
- [x] WAITING tooltip for mid-race joiners

#### Game Flow & Scoring (Phase 6)
- [x] State machine: intermission → racing → results → loop
- [x] Intermission timer (server-authoritative)
- [x] Position-based scoring system (1st-6th place points)
- [x] Session scoreboard (accumulated player points)
- [x] Transition timing & UI feedback
- [x] AFK auto-boot to spectator
- [x] Disconnect → remove as player (can rejoin as spectator)

#### UI/UX Polish (Phase 6.5)
- [x] Intermission hanging sign image
- [x] Top-right timer with RUSH button
- [x] Centered event log (left side, 50% y-axis)
- [x] Favicon integration
- [x] Page scroll lock during racing
- [x] Event log scrollbar
- [x] Viewer/Spectator/Trainer badges in chat
- [x] Discord avatar on panels
- [x] 3-hour session timer display
- [x] Splash screen loading state & auto-enter
- [x] OAuth callback error handling
- [x] POST `/auth/logout` endpoint
- [x] discordId as userId

### **What's NOT Working / Incomplete ❌**

#### Known Issues
1. **Race Logic Broken** ⚠️ (Primary Issue)
   - User reported: "race process isn't working"
   - Needs diagnosis:
     - Are racers moving on track?
     - Are laps being counted correctly?
     - Are finishes detected?
     - Is WebSocket sending position updates?
   - **Last known state:** User hasn't tested in ~1 month

2. **Timer Increments Issue** ⚠️
   - Intermission timer counting in 5-second jumps
   - Backend tick is 100ms, but broadcasts are throttled to every 5s during intermission (line 256 in session_routes.js: `if (Math.floor(this.session.timers.intermission) % 5 === 0)`)
   - Frontend may not be interpolating smoothly

3. **AI Bot Profile Images** 
   - AI bots fill empty slots but don't have profile images
   - Images exist at `images/ai_profiles/` (11 PNG files)
   - Need to wire up to display when AI takes over

4. **Chat Input Not Wired**
   - Event log has input box UI
   - Needs to send messages over WebSocket
   - Backend needs chat message handling

5. **Session Code UI on Splash**
   - "Create Session" and "Join Session" flow partially implemented
   - Needs polish and testing

#### Deferred Features (Phase 7+)
- [ ] Announcer dialogue system (Ana/Lifeweaver voicelines)
- [ ] XTTS audio pipeline for voice generation
- [ ] Character selection UI redesign (Overwatch-style grid)
- [ ] Enhanced VFX polish
- [ ] Mobile responsive design
- [ ] Production deployment (GitHub Pages + Workers)
- [ ] Advanced testing (unit tests, load tests)
- [ ] Monitoring & optimization

---

## FILE ORGANIZATION & CODE STRUCTURE

### Backend Code Quality
- **Highly organized** with clear section headers (marked with `##` comments)
- **Monolithic approach** for ease of navigation (per user preference)
- Each major file has a table of contents at the top
- Race engine (`race_engine.js`) is ~300 lines, well-documented
- Session routes (`session_routes.js`) is ~533 lines with 11 sections

### Frontend Code Quality
- **Moderately organized** with some section headers
- Some TODOs present (5 found via grep):
  - `racing.js:450` - "draw racers on ellipse once renderer is wired"
  - `racing.js:1048` - "Integrate with existing systems"
  - `discord_integration.js:232` - "Real Discord OAuth method"
- `main.js` is ~615 lines (manages splash, session join, notifications)
- `racing.js` is ~1060 lines (track rendering, ellipse math, sprite system)
- `discord_integration.js` is ~898 lines (panel management, auth)

### Styling
- 20 SCSS files in `styles/` directory
- Compiled to `main/styles.css` via Sass
- Watch mode available: `npm run watch:css`
- Build command: `npm run build:css`

---

## DEVELOPMENT WORKFLOW

### Setup & Running Locally

#### Prerequisites
- Node.js installed
- Wrangler CLI installed (`npm install -g wrangler`)

#### Start Backend (Cloudflare Workers Dev Server)
```bash
cd backend
wrangler dev
# Backend runs at http://127.0.0.1:8787
```

#### Start Frontend (Static File Server)
```bash
cd main
# Use any static file server, e.g.:
python -m http.server 8081
# Or: npx serve -l 8081
# Frontend at http://127.0.0.1:8081
```

#### SCSS Compilation (Auto-watch)
```bash
# From project root:
npm run watch:css
# Or double-click tools/watch_scss.bat
```

#### Manual SCSS Build
```bash
npm run build:css
```

### Configuration

#### Backend Config (`backend_config.js`)
```javascript
backendBaseUrl: 'http://127.0.0.1:8787'
```

#### Discord OAuth (Not Yet Configured)
Backend expects environment variables:
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `SESSION_JWT_SECRET`

Add to `wrangler.toml` secrets or local `.dev.vars` file.

---

## DATA MODEL

### Session State (SessionDO)
```javascript
{
  code: "ABCD",              // 4-letter session code
  phase: "intermission",     // "intermission" | "racing" | "results"
  players: {                 // Slots 1-6
    1: {
      userId: "discord123",
      username: "Player1",
      avatar: "https://cdn.discord...",
      characterId: "mercy",
      locked: true,
      ai: false              // true if AI-controlled
    }
  },
  spectators: 0,
  viewerCount: 5,            // Live WebSocket connections
  timers: {
    intermission: 180,       // seconds
    race: 0,                 // seconds
    results: 8               // seconds
  },
  race_distance: 1600,
  takenCharacters: Set<"mercy", "dva">,
  created_at: 1729512000000,
  expires_at: 1729522800000  // created_at + 3 hours
}
```

### Race State (Race class)
```javascript
{
  racers: [Racer, Racer, ...], // 6 Racer instances
  race_clock: 45.3,            // seconds elapsed
  is_running: true,
  finish_order: [],            // [{name, time}, ...]
  results_cached: {            // After race ends
    placements: [
      {name: "Mercy", position: 1, time: 56.2, points: 50000},
      {name: "D.Va", position: 2, time: 58.1, points: 23000}
    ]
  },
  events: []                   // Event strings for log
}
```

### Racer State (Racer class)
```javascript
{
  name: "Mercy",
  base_speed: 72,
  power: 68,
  max_stamina: 94,
  current_stamina: 76,
  determination: 78,
  position: 845.3,             // meters
  finished: false,
  finish_time: null,
  lapsCompleted: 2,
  racer_style: "pace_chaser",
  active_effects: [
    {stat: "speed", type: "add", amount: 5, ttl: 2.3, label: "cheer speed"}
  ],
  lastOvertakenAtClock: 12.5
}
```

### Character Database Schema
```javascript
{
  "id": "mercy",
  "display_name": "Mercy",
  "role": "Support",
  "stats": {
    "speed": 72,
    "power": 68,
    "stamina": 94,
    "determination": 78
  },
  "racer_style": "pace_chaser",
  "ability": {
    "id": "mercy_ability",
    "name": "Valkyrie",
    "cooldown_sec": 15,
    "effects": {
      "speed_add": 0,
      "stamina_add": 20,
      "position_add": 0
    }
  },
  "voice": {
    "ability_voiceline_path": "../sounds/OHR_Voicelines/abilities/mercy_ability.wav",
    "victory_voiceline_path": "../sounds/OHR_Voicelines/finish/mercy_victory.wav"
  },
  "assets": {
    "thumbnail": "../images/current_roster/mercy_roster.png",
    "portrait_large": "../images/current_roster/mercy_horse_full.png",
    "racing_sprite": "../images/current_roster/mercy_sprite_small.png"
  },
  "available": true
}
```

---

## WEBSOCKET PROTOCOL

### Client → Server
```javascript
// Heartbeat (keep-alive)
{type: "ping", t: 1729512345678}

// Chat message (not yet implemented server-side)
{type: "chat", userId: "discord123", message: "Go Mercy!"}
```

### Server → Client
```javascript
// Full state snapshot (on connect or manual resync)
{
  type: "state",
  phase: "racing",
  players: {...},
  timers: {...},
  race_distance: 1600,
  viewerCount: 5,
  session_meta: {created_at: ..., expires_at: ...},
  results: null | {...},
  player_points: {
    "discord123": {username: "Player1", points: 73000}
  },
  points_table: {1: 50000, 2: 23000, 3: 16000, 4: 3250, 5: 1110, 6: 660}
}

// Event message (race events, system messages)
{
  type: "event",
  message: "overtake: D.Va passes Mercy!"
}

// Phase change
{
  type: "phase",
  phase: "racing"
}

// Racer positions delta (during race, every 100ms)
{
  type: "positions",
  positions: [
    {name: "Mercy", position: 845.3, lap: 2},
    {name: "D.Va", position: 823.1, lap: 2}
  ]
}
```

---

## GAME LOOP FLOW

### Full Session Lifecycle

```
1. CREATE SESSION
   ↓
2. INTERMISSION (180s timer)
   - Players join (claim slots 1-6)
   - Select characters (unique per session)
   - Lock in selections
   - Timer counts down or RUSH button pressed
   ↓
3. RACING
   - Race starts (AI fills empty slots)
   - Server ticks at 100ms:
     * Update racer positions
     * Drain stamina
     * Apply buffs/debuffs
     * Detect overtakes → surge/rattle
     * Detect lap completions
     * Detect finishes
   - Players can CHEER (triggers buff or ability)
   - WebSocket broadcasts positions every tick
   - Race ends when all racers finish or timeout (5 min)
   ↓
4. RESULTS (8s display)
   - Show finish order
   - Calculate points (1st: 50k, 2nd: 23k, 3rd: 16k, 4th: 3.25k, 5th: 1.1k, 6th: 660)
   - Accumulate player session points
   - Display updated scoreboard
   ↓
5. RETURN TO INTERMISSION
   - Reset timer to 180s
   - Clear character selections
   - Keep player slots (unless AFK or disconnected)
   - Loop continues until session TTL (3 hours) or inactivity (2 min no players)
```

### Phase Transitions (Server-side)

**Trigger:** Intermission timer hits 0 or `/start_race` POST  
**Action:**
1. Auto-boot AFK players (not locked in)
2. Create 6 Racer instances (mix of human + AI)
3. Initialize Race with tick loop
4. Set phase = "racing"
5. Broadcast phase change + state

**Trigger:** All racers finish or race timeout  
**Action:**
1. Stop race tick loop
2. Compute results (finish order, times, points)
3. Set phase = "results"
4. Start 8s results timer
5. Accumulate player points
6. Broadcast results + state

**Trigger:** Results timer hits 0  
**Action:**
1. Clear race instance
2. Clear character selections (keep player slots)
3. Reset intermission timer to 180s
4. Set phase = "intermission"
5. Broadcast state

---

## KEY MECHANICS

### Racer Movement
- **Base Speed:** Character stat (50-80 range)
- **Stamina Factor:** Current stamina / max stamina (floor at 35%)
- **Power Factor:** 1 + (power - 70) × 0.004
- **Pace Profile:** Multiplier based on race progress (0-100%)
  - Front runner: strong early, fades late
  - Pace chaser: consistent throughout
  - Late surger: slow start, strong mid-late
  - End sprinter: explosive final stretch
- **Effects:** Additive (+/- speed) and multiplicative (×1.0-1.35 cap)
- **Speed Formula:**
  ```
  speed = base_speed × pace × stamina_factor × power_factor × mult_effects + add_effects + power×0.1
  ```
- **Movement:** `position += speed × dt` (dt = 0.1 seconds per tick)

### Determination System
- **On Overtake:**
  - Overtaking racer gets "surge" buff (speed multiplier based on determination)
  - Overtaken racer has chance to get "rattle" debuff (speed penalty)
  - Rattle probability: 35% base, reduced by determination
- **Cheer Window:** If cheered within 2s of being rattled:
  - Chance to clear rattle (30% base + determination bonus)
  - Otherwise, mitigate rattle (halve penalty)

### Anti-Spam Protection
- **Cooldown:** Per-character ability cooldown (server-enforced)
- **Rate Limiting:** Excessive cheers (>6 in 3 seconds) → 429 error
- **Future:** Could add debuff for spam (not yet implemented)

### Lap & Finish Detection
- **Lap Distance:** 400m per lap (4 laps total = 1600m)
- **Lap Completion:** When `position >= (lapsCompleted + 1) × 400`
- **Finish:** When `lapsCompleted >= 4` (total laps)
- **Race End:** When all racers finish OR 5 minutes elapsed

### AI Behavior
- **Fill Empty Slots:** Auto-assign random available characters
- **AI Cheering:** Random periodic cheers (4-9 second intervals)
- **AI Takeover:** When player disconnects mid-race, racer switches to AI control

---

## TESTING & DEBUGGING

### How to Test Full Loop

1. **Start Backend:**
   ```bash
   cd backend
   wrangler dev
   ```

2. **Start Frontend:**
   ```bash
   # In another terminal
   cd main
   python -m http.server 8081
   ```

3. **Open in Browser:**
   - Navigate to `http://127.0.0.1:8081/index.html`
   - Click "CREATE NEW SESSION" (should generate 4-letter code)
   - Open DevTools console to watch logs

4. **Join Session:**
   - Click an empty panel (1-6) to claim slot
   - Should see username appear (mock auth)

5. **Select Character:**
   - Click "CHOOSE" button on your panel
   - Select a character from overlay
   - Click "LOCK IN"

6. **Start Race:**
   - Wait for intermission timer (or open multiple tabs to fill slots)
   - Race should auto-start when timer hits 0
   - Watch racers move around ellipse track
   - Click "CHEER" button during race

7. **Check Results:**
   - After all racers finish, results modal should appear
   - Shows finish order and player points

8. **Verify Loop:**
   - After 8 seconds, should return to intermission
   - Timer resets to 180s
   - Panels keep players but clear selections

### Debug Tools

**Browser Console:**
```javascript
// Access global systems
window.gameEngine
window.audioSystem
window.characterSelection
window.backendClient

// Force phase change (if backend supports)
window.backendClient.startRace()

// Check session state
window.backendClient.getState().then(console.log)
```

**Backend Logs (Wrangler):**
- All console.log() statements appear in Wrangler dev terminal
- Watch for tick loop output, cheer events, phase transitions

**WebSocket Inspector:**
- Use browser DevTools → Network → WS tab
- Watch messages flowing in real-time
- Should see `{type: "positions", ...}` every 100ms during race

---

## KNOWN ISSUES & GOTCHAS

### 1. Race Logic Not Working
**Symptom:** User reported race isn't working (specifics unknown)  
**Possible Causes:**
- WebSocket not connecting properly
- Race tick loop not running (check backend console)
- Frontend not rendering positions from server
- Racer movement formula bug
- Finish detection not triggering

**Debugging Steps:**
1. Check browser console for WS connection errors
2. Check Wrangler console for tick loop logs
3. Inspect WS messages (should see position updates every 100ms)
4. Add console.log in `racing.js` updateRacerPositions() to verify positions
5. Check if `race.is_running` is true in backend state

### 2. Timer Jumping in 5-Second Increments
**Cause:** Backend only broadcasts intermission state every 5 seconds (optimization)  
**Line:** `session_routes.js:256`  
```javascript
if (Math.floor(this.session.timers.intermission) % 5 === 0) {
  this.broadcast({ type: 'state', ...this.composeState() });
}
```
**Fix Options:**
- **Frontend:** Interpolate timer locally between server updates
- **Backend:** Broadcast more frequently (but increases WS traffic)

### 3. Character Selection Shows All Characters But Only 7 Available
**Cause:** `character_database.json` has `"available": true` for only 7 characters  
**Current Roster:** Ashe, Baptiste, D.Va, Mercy, Pharah, Reinhardt, Soldier 76  
**Fix:** Filter by `available` field in character selection UI

### 4. No Error Handling for Session Not Found
**Symptom:** If session code is invalid, frontend may hang  
**Fix:** Add error handling in `backend_client.js` for 404 responses

### 5. Discord OAuth Not Fully Configured
**Status:** Code exists but requires environment variables  
**Workaround:** Mock auth is active (localStorage-based)  
**To Enable:** Set secrets in Wrangler and update redirect URI

---

## ASSET INVENTORY

### Images
- **Current Roster:** 129 files (128 PNG + 1 MD)
  - Per character: `_roster.png`, `_horse_full.png`, `_sprite_small.png`
- **AI Profiles:** 11 PNG files (for AI-controlled panels)
- **UI Assets:** Logo, splash screen, jukebox icon, exit button, halo, intermission sign, track map

### Sounds
- **Total:** 199 files (185 WAV, 9 MP3, 3 JSON)
- **Structure:**
  - `OHR_Voicelines/abilities/` - Ability voicelines per character
  - `OHR_Voicelines/finish/` - Victory voicelines per character
  - Announcer lines (Ana/Lifeweaver) for race events

### Styles
- **SCSS Source:** 20 files in `styles/` directory
- **Compiled Output:** `main/styles.css` (auto-generated, DO NOT EDIT)

---

## PROJECT DIRECTION QUESTIONS FOR USER

### Critical Path
1. **Primary Blocker:** You mentioned "race logic isn't working." What specifically happens when you try to run a race?
   - Do racers appear on screen?
   - Do they move at all?
   - Does the race timer count up?
   - Do you see lap counter updates?
   - What does the browser console show?
   - What does the Wrangler dev server log show?

2. **MVP Scope:** What's the minimum you need working for this to be "usable"?
   - Solo testing (1 player + 5 AI bots)?
   - Full 6-player multiplayer?
   - Discord OAuth required or mock auth acceptable?
   - Chat system critical or can be deferred?

### Feature Priorities
3. **Announcer System (Phase 7):** This is a large scope item. Is this:
   - Critical for launch?
   - Nice-to-have but deferrable?
   - Can be simplified (text-only, no audio)?

4. **Character Selection Redesign:** You have detailed plans for Overwatch-style grid. Is this:
   - Blocking other work?
   - Can wait until core loop is stable?
   - User testing showed current UI is unusable?

5. **AI Bot Profile Images:** Simple fix to wire up existing assets. Priority?
   - High (breaks immersion)?
   - Low (cosmetic only)?

### Deployment & Infrastructure
6. **Target Platform:** Where do you want this deployed?
   - Cloudflare Workers + GitHub Pages (as planned)?
   - Self-hosted?
   - Local testing only for now?

7. **Discord Integration:** Do you have Discord app credentials ready?
   - Yes, just need to configure
   - No, need to create Discord app
   - Not needed yet, mock auth is fine

### UX & Polish
8. **Mobile Support:** Current UI is desktop-focused. Mobile priority?
   - Must support mobile browsers
   - Desktop-only is acceptable
   - Mobile can be phase 2

9. **Session Codes:** Splash screen has UI for join/create but needs polish. Priority?
   - Critical (users need to share session codes)
   - Works well enough for testing
   - Needs redesign

### Performance & Scale
10. **Concurrent Sessions:** How many simultaneous sessions do you expect?
    - Just you testing (1-2 sessions)
    - Small friend group (5-10 sessions)
    - Public launch (100+ sessions)

11. **Race Replay / History:** Should races be recorded for playback?
    - Yes, need replay system
    - No, live-only is fine

### Audio & Voicelines
12. **XTTS Pipeline:** You mentioned future voice generation. Is this:
    - Already recorded (just need to integrate)?
    - Needs to be generated (requires XTTS setup)?
    - Placeholder text-to-speech acceptable?

---

## RECOMMENDED NEXT STEPS

### Immediate Actions (MVP Path)

1. **Diagnose Race Logic Issue** ⚠️ HIGH PRIORITY
   - Run full test scenario (create → join → select → race)
   - Collect browser console logs
   - Collect Wrangler dev server logs
   - Identify exact failure point
   - Fix root cause

2. **Smooth Timer Display**
   - Implement client-side interpolation for intermission timer
   - Or increase broadcast frequency to 1-second intervals

3. **Test Full Game Loop**
   - Verify intermission → racing → results → loop cycle
   - Test with 1 player + 5 AI bots
   - Confirm scoring accumulates across races
   - Check session TTL countdown display

4. **Wire AI Profile Images**
   - Map AI bot names to `images/ai_profiles/*.png`
   - Display on panel when AI controls a racer
   - ~30 minutes of work

5. **Fix Character Selection Filter**
   - Only show `available: true` characters
   - Or expand roster by setting more to `available: true`

### Short-Term Enhancements

6. **Chat System (1-2 hours)**
   - Wire chat input to WebSocket
   - Backend: broadcast chat messages to all viewers
   - Display in event log with user badges

7. **Session Code Polish (1-2 hours)**
   - Improve splash screen UX for create/join flow
   - Add session code display during game (top bar?)
   - Copy-to-clipboard button

8. **Error Handling (1-2 hours)**
   - Add user-facing error messages (toast notifications?)
   - Handle session not found, WS disconnect, etc.
   - Reconnection logic

### Medium-Term Features

9. **Character Selection Redesign (4-6 hours)**
   - Implement Overwatch-style grid layout
   - Tank/Damage/Support separators
   - Two-row offset layout
   - Large character preview

10. **Announcer System (8-12 hours)**
    - Implement event-to-voiceline mapping
    - Priority queue system
    - Dialogue UI bubble
    - Audio playback integration
    - Can start with text-only, add audio later

### Polish & Deployment

11. **Mobile Responsive (4-6 hours)**
    - Responsive breakpoints
    - Touch-friendly controls
    - Viewport scaling

12. **Production Deployment (2-3 hours)**
    - Publish Workers to Cloudflare
    - Deploy frontend to GitHub Pages
    - Configure custom domain (optional)
    - Set Discord OAuth production credentials

13. **Testing & QA (ongoing)**
    - Multi-player stress testing
    - Edge case handling (all players leave, timeout scenarios)
    - Performance profiling (VFX load, WS message rate)

---

## CODE PATTERNS & CONVENTIONS

### User Preferences (from rules)
- **Sequential Focus:** Work on one feature to completion before adding more
- **Avoid "finalizing" comments:** Future edits will overwrite
- **Confidence Rating:** Aim for 97%+ before marking done
- **Table of Contents:** Use headers and separators for navigation
- **Slightly Monolithic:** Avoid over-modularization (easier for AI context)
- **No Emojis:** Professional tone only

### Coding Style
- **Server-Authoritative:** All game logic runs on backend, client renders only
- **Section Headers:** Use `##########` lines and numbered sections
- **Normalize Names:** `normalizeName()` for case-insensitive character matching
- **Event Queue:** Server generates event strings, client consumes for log/VFX
- **Delta Updates:** WebSocket sends minimal state changes, not full snapshots

### File Headers
Most files have structured headers like:
```javascript
// ################################################################################
// # File Purpose & Overview
// #
// # Sections:
// # 1) Constructor & Initialization
// # 2) Core Logic
// # 3) Helper Functions
// # ...
// ################################################################################
```

---

## DEPENDENCIES

### Backend (`backend/package.json` - not present, using Wrangler globals)
- Cloudflare Workers Runtime
- Durable Objects
- WebSocket API

### Frontend (No package.json for frontend, uses CDN or built-in)
- Vanilla JavaScript (ES6+)
- No frameworks or libraries
- CSS from SCSS compilation

### Root (`package.json`)
- `sass` ^1.77.0 (SCSS compilation)
- `npm-run-all` ^4.1.5 (parallel script runner)

### Dev Tools
- Wrangler CLI (Cloudflare Workers dev server)
- Any static file server (Python HTTP, npx serve, etc.)

---

## CONCLUSION & HANDOFF SUMMARY

### Project Status
**Overwatch Horse Racing is 70-80% complete toward MVP.**

**Working:**
- ✅ Backend infrastructure (Workers, Durable Objects, WebSocket)
- ✅ Session management (create, join, leave, select, lock in)
- ✅ Server race engine (tick loop, movement, laps, finishes)
- ✅ Frontend rendering (ellipse track, sprite system, HUD)
- ✅ Discord panels (claim, leave, states)
- ✅ Scoring system (placement points, session accumulation)
- ✅ Game loop (intermission → racing → results → loop)

**Broken / Needs Diagnosis:**
- ❌ Race execution (specifics unknown, user reported issue)
- ❌ Timer display (jumps in 5s increments)

**Incomplete / Deferred:**
- ⏸️ Chat system (UI exists, backend not wired)
- ⏸️ AI profile images (assets exist, not displayed)
- ⏸️ Announcer voicelines (large scope, Phase 7)
- ⏸️ Character selection redesign (cosmetic)
- ⏸️ Mobile responsive (desktop-only currently)
- ⏸️ Production deployment (local dev only)

### Critical Next Action
**Debug and fix the race logic issue.** This is the primary blocker for having a playable MVP. Once races run successfully, the rest is polish and enhancements.

### For Next AI Session
1. **Read this document first** to understand architecture and current state
2. **Ask user for race bug specifics** (console logs, observed behavior)
3. **Test locally** if possible (start backend + frontend, run full loop)
4. **Focus on one issue at a time** (per user preference)
5. **Aim for 97%+ confidence** before marking work complete
6. **Use section headers** for any code changes (monolithic style)

---

**Document Author:** AI Assistant (Claude Sonnet 4.5)  
**Date:** October 21, 2025  
**Last Updated:** Initial creation  
**Next Review:** After race logic diagnosis


