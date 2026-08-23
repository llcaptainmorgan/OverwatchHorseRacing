# OHR Phased Master TODO Checklist (Unified)

**PROJECT UI THEME COLORS:**
- `#fcc7db` - light_pink
- `#d7f0f1` - font_blue  
- `#f0f0f0` - white
- `#404d70` - back_blue
- `#ff7f22` - Overwatch_Orange
- `#ffd2b2` - Overwatch_highlight

notes:
three types:
player = "trainer"
spectator is someone who joins midrace and fills a spot, but is not allowed to play until the end of a race, given the "WAITING" button.
viewer is someone in session viewing without being in auser panel or being assigned to one.

SCSS Watcher (auto-compile)
1) Easiest: double-click tools/watch_scss.bat
2) Or in a terminal at project root: npm run watch:css
3) Edit SCSS files; output updates to main/styles.css automatically (run npm install once if first time)

Manual SCSS build (one-time)
1) In a terminal at project root: npm run build:css
2) Reload http://127.0.0.1:8081/main/index.html
---

## Phase 0 — Decisions & Setup
- [x] Choose Cloudflare Workers + Durable Objects (server-authoritative, free tier, WS)
- [ ] Initialize Workers project with Wrangler and bind Durable Object namespace
- [ ] Configure workers.dev or custom domain; enforce HTTPS/WSS
- [ ] Set CORS to allow GitHub Pages origin
- [x] Establish repo layout: `backend/` (Workers), `main/` (frontend), `shared/` (settings)
- [x] Frontend config for backend base URL (env/config file)
- [x] Transport: WebSocket primary; fallback to SSE/long-poll if needed
- [x] Unified race settings in `shared/race_settings.js`
- [x] Enforce architecture: backend authoritative for phase, timers, positions, cooldowns; client handles UI-only systems (button SFX, jukebox widget/music, event log chat UI, panel claim/leave red X, character selection overlay)

## Phase 1 — Data Model & Enhanced Roster
- [x] Update `main/character_database.json`:
  - [x] Add D.Va to current roster (total 7 available)
  - [x] Add `determination` attribute (affects debuff resistance/clear chance on overtake)
  - [x] Add `racer_style` enum: `front_sprinter`, `pace_chaser`, `late_surger`, `end_sprinter`
  - [x] Add enhanced `ability` schema:
    - [x] `id`, `name`, `description`, `cooldown_sec`
    - [x] `effects`: `speed_add`, `power_add`, `stamina_add`, `position_add`
    - [x] `voice` paths for ability and victory voicelines



## Phase 2 — Backend Session API (Workers + Durable Objects)
- [x] Create `SessionDO` Durable Object: holds session state and tick loop
- [x] Define session state: sessionCode, phase, players (1–6), spectators, roster, viewerCount, timers
- [ ] HTTP endpoints:
  - [x] POST `/sessions` → create session, return sessionCode
  - [ ] GET `/sessions/:code` → session meta + phase
  - [x] POST `/sessions/:code/join` → join; optionally claim slot (1–6)
  - [x] POST `/sessions/:code/leave` → leave slot
  - [x] POST `/sessions/:code/select_character` → choose unique character
  - [x] POST `/sessions/:code/lock_in` → lock selection
  - [x] POST `/sessions/:code/start_race` → optional manual start (auto via timer otherwise)
  - [x] POST `/sessions/:code/cheer` → cheer own racer (server validates cooldown/ownership)
  - [x] GET `/sessions/:code/state` → full snapshot for resync
- [x] WebSocket endpoint: WS `/sessions/:code/stream` → deltas for timers, positions, events, viewerCount
- [x] Viewer counting on WS connect/close
- [x] Security:
  - [x] Basic rate limits for join/cheer
  - [x] Ownership checks
- [x] Enforce single-slot-per-user (server-authoritative):
  - [x] Reject `join` if `userId` already owns a slot; re-associate on reconnect
  - [x] Normalize `userId` across tabs; prevent multi-panel claims (server returns existing slot)
- [x] Presence/heartbeat + disconnect handling:
  - [x] Heartbeat support via WS `ping` messages to track last activity
  - [x] If race is running when player disconnects/leaves → hand control to AI until race end
  - [x] Session inactivity shutdown: when 0 players for 2 minutes → broadcast close and stop session

## Phase 3 — Server Racing Engine (Enhanced Demo Port)
- [x] Implement `Racer`: base_speed, power, stamina, current_stamina, position, finished, ability/buff state
- [x] Implement `Race`: race_clock, finish_order, last_ranks, event queue (overtake, finish, buff_apply, ability, buff_expire)
- [x] Tick loop (e.g., 100ms) inside `SessionDO`: update buffs, move racers, detect finishes and overtakes
- [x] Race config: 1600m total, 400m/lap, TOTAL_LAPS=4
- [x] AI fill: assign random characters for vacant slots; periodic AI cheers on intervals
 - [x] **Enhanced Mechanics:**
   - [x] **Determination System**: On overtake → chance for debuff on overtaken; cheer during window may clear/mitigate based on determination value
   - [x] **Anti-spam Protection**: Excessive cheers → temporary debuff; track cheer frequency per player
   - [x] **Pace Profiles**: Affect performance at different race stages (early/mid/late)
- [x] Basic ability cooldowns enforced server-side
- [x] Broadcast minimal deltas over WS for efficiency
- [x] Mid-race leave handling:
  - [x] On player disconnect/leave → immediately switch that racer to AI control (keep position/state)
  - [x] On player `leave` → slot freed; racer runs AI to race end
- [x] AFK policy (intermission):
  - [x] If user fails to select and lock in before timer ends → auto-boot to spectator and free slot

## Phase 4 — Client Track & Rendering (OHRRacingSystem Enhanced)
- [x] Replace track logic with PATH_CONFIG-based ellipse (from demo) and retain customization comments (partial: initial ellipse renderer wired to server positions)
- [x] Convert linear distance → ellipse (x,y), perspective scale, zIndex; implement sprite flip
- [x] Use current roster per-character racing sprites (`images/current_roster/*_sprite_small.png`) (with placeholder fallback for missing)
- [x] **VFX System:**
  - [x] Positive buff effect: transparent overlay/particle effect above racer sprite
  - [x] Debuff effect: darker/red overlay indicating negative status
  - [x] Anti-spam effect: distinct visual for spam penalty
  - [x] Panel avatar effects: visual indicators above user panel when their racer gets buff/debuff
  - [x] Roster image banner VFX: flash/outline/aura on the roster image above the panel when ability/buff/debuff triggers
- [x] Lap counter and race timer from server state
- [x] Event log and results scoreboard (finish order & time)
 - [x] Left-side Event Log panel (dockable):
   - [x] Tabs: All | Events | Chat (filtering views)
   - [x] Timestamps, event type badges (ability, overtake, finish, debuff, system)
   - [x] Chat input box (client-side), send over WS;
   - [x] Style to match existing `styles.css` (no layout disruption)
   - [x] Virtualized scroll list for performance
- [x] PATH_CONFIG comments + customization parity via `UI_CONFIG.trackPath` and URL params (path_cx, path_cy, path_rx, path_ry, path_hp, path_vp, path_sa)

## Phase 5 — Discord Panels & Enhanced UX
- [x] Panel states by phase:
  - [x] INTERMISSION: CHOOSE and LOCK IN
  - [x] RACING: CHEER (only for own slot); spectators disabled
  - [x] MID-RACE JOIN: show greyed "WAITING" until next intermission
- [x] Enforce: user can cheer only their own racer
- [x] **Visual Systems:**
  - [x] Cheer cooldown timer per ability (varies by character)
  - [x] Buff/debuff status indicators on panel avatar
  - [x] Anti-spam warning visuals
- [x] Roster image banner above each occupied user panel:
  - [x] Show selected character roster image above panel header
  - [x] Greyed/blurred when panel is WAITING/spectator; full color when locked in
  - [x] Update live on selection/lock-in and when AI takes over
- [x] Add small red `exit.png` leave icon (top-right) visible only for the owning user:
  - [x] Clicking triggers `leave` → user becomes spectator; slot freed or AI takes over mid-race
  - [x] A11y: aria-label, keyboard-activatable
  - [x] Hidden for non-owners
- [x] Prevent multi-panel claim in UI:
  - [x] If user already has a slot, disable other panel claim buttons and show informative tooltip
  - [x] On reconnect, automatically rebind to prior slot and reveal their exit icon
- [x] Spectator mode UI for non-slotted viewers
  - [x] Spectator floating badge during racing/results
- [x] Show live viewer count in UI
- [x] WAITING tooltip: clearer copy for non-owners/unclaimable panels during race

## Phase 6 — Game Flow & Scoring System
- [x] State machine: intermission → racing → results → intermission
- [x] Intermission timer visible; mirror server timer when connected (disable local tick in server-authoritative mode)
- [x] **Position-Based Scoring System** (no betting/money):
  - [x] Character placement tracking (1st-6th place points)
  - [x] Session-based player scoreboard based on their racer's performance
  - [x] Results display: character finish order + accumulated player points
- [x] Transition timing and UI feedback
- [x] AFK/absence rules:
  - [x] Define AFK threshold during intermission (e.g., no action until t=0)
  - [x] Auto-boot AFK users to spectator; notify in event log and panel UI
  - [x] If a player leaves the site (WS disconnect beyond grace) → remove as player; they may rejoin as spectator and reclaim a slot next intermission

#### Phase 6.5 — fix bugs
## UI/UX Polish Tasks
- [x] Restore intermission image (hanging sign) and top-right timer with Rush button
- [x] move event log overall HUD  so it is centered with left side of screen using 50% on y axis to keep it centered, keep it hugging left side as well.
- [x] get favicon.ico from C:\Users\jesse\OneDrive\Documents\CODES\overwatch horse racing
- [x] Identify & fix page scroll cause during racing (lock layout)
  - [x] identified in app, it's the same div or container or something that stores the lap and lap timer information, the session timer, and the timer for the intermission. please help me find where all these are.
- [x] organize the monolithic style.css, and move and organize the code in the script to fit a table of contents section by section for user to easily find and configure the ui more proper.
- [x] Add scroll to event log and ensure smooth virtualization works with scrollbar
- [x] if a viewer then they will have a viewer badge after their username so it will be like so in the chatbox: "[timestamp] | [username] [badge]: [message]" and we can color based on if they are a viewer, a spectator, or a "trainer" as trainer will be the term for player.
- [ ] Enable entering messages to event log (wire chat input to WS). Consider Discord integration to pull usernames
- [x] Set Discord user panel profile image to Discord avatar (not roster banner); keep roster banner separate
- [ ] Provide anonymous/AI profile image for AI takeover panels
- [x] Verify 3-hour session reset timer on server and link display to frontend UI
- [x] Splash screen: add loading state (spinner/progress) that replaces ENTER/SIGN IN while systems initialize and until `/auth/me` resolves
- [x] Splash screen: single-click debounced "SIGN IN WITH DISCORD"; show button only after init completes; auto-enter if already signed in
- [x] OAuth: diagnose and fix occasional 400 on `/auth/discord/callback` (redirect URI exact match, state handling, error logs). Add dev-friendly error surface
- [x] Panel claiming: ensure Discord avatar and username are broadcast to all clients (pass `avatar` through `/join`; render on all panels)
- [?] Session Code UI: on splash, offer "Create Session" (POST `/sessions` → show 4-letter code) and "Join Session" (input code → set `?session=CODE` and connect)
- [?] Session Codes backend: ensure 4-letter code generation stable and unique; reuse existing `/sessions` endpoint; document flow
## game functions
- [x] POST /auth/logout → clear session cookie
- [x] Use discordId as userId for `/join`, `/select_character`, `/lock_in`, `/cheer`


TODO LATER;
- race and loop server timer functions and ui positions and design.
need to fix character selection ui as well, and make overwatch style.
- [ ] race process isnt working
- [x] server counting is processing in 5 second increments for the intermission timer, are we running server calls/requests when we calculate using javascripts such as racing_engine.js? are we going to be making many requests because of our backend javascripts?
- [ ] setting up bot profile images from "C:\Users\jesse\OneDrive\Documents\CODES\overwatch horse racing\images\ai_profiles" with associated names for filling trainer spots.
- [ ] add ai bots that replace people who leave or fill spots.
- [ ] REDESIGN THE Character selection: show ALL roster in overwatch style, have lock in button moved, the stats container moved where each stat and its bar is all on one row above the roster grid. have seperations between tanks, damage, and supports, and create two rows of roster images just like overwatch, with one row having a offset in the x axis. 
so for example think of this: 
[showing roster selection]
xxxx xxxxx xxxx
 xxxx xxxxx xxxxx
 [end of showing roster selection example using x's]
have the character selection ui be directly above the user panels and centered, but arraying across the wwidth of the screen the two rows of roster images. When selecting a character have the character show big in the middle with the character png going below and behind the roster images, as well as a rendered transparent fade on the lower half of the horse_full images. if this too much i can create character screen images that have the transparent fade let me know.
remove the character selection backdrop and border, as it makes it seem very blocky. 
 

## Phase 7 — Enhanced Audio & Voiceline System
- [ ] Announcer Dialogue System (Race Phase Only)
  - [ ] Alternate announcers (Ana/Lifeweaver) randomly per line; both have full sets for all event types
  - [ ] Interrupters: ultra-short exclamations (e.g., “Hey! hey!”) that may pre-empt any line; do not consume cooldowns
  - [ ] Follow-ups: certain interrupters immediately followed by context (e.g., anti-spam callout)
  - [ ] Story/Banter mode: long monologues and banter between announcers (non-race-related fun content)
  - [ ] Story/banter may run uninterrupted except on race finish; finish interrupts with finish lines
  - [ ] Frequency rules: speak often; min gap 2s, max gap 20s between lines (true random within bounds)
  - [ ] No general queueing (to avoid falling behind); only interrupters can “queue” to attach to a triggering event
  - [ ] Finish behavior: play finish lines first; then win lines; ensure enough time for both
  - [ ] Anti-spam commentary as its own event type (e.g., “we have someone cheering too loud!”)
  - [ ] Template expansion: add event types (overtake, lap, finish, ability, anti_spam, story, banter, interrupter)
  - [ ] SFX: play voice line audio client-side for each line (to be generated via future XTTS pipeline)
  - [ ] Dialogue UI: bubbly transparent box with round edges, profile image (Ana/Lifeweaver), typewriter text; click/tap to skip typing
  - [ ] Controls: ESC/Click to close; dedicated “Announcer Mute” toggle in jukebox settings (mutes announcer only)
  - [ ] Visibility: show only during race phase; on phase change auto-hide the dialogue box but allow audio to finish
  - [ ] Layering: z-index above track but below selection/results overlays
  - [ ] Auto-hide: 1s after voice audio finishes (if not manually dismissed)
  - [ ] Mobile: responsive size reduction, readable fonts
  - [ ] Accessibility: aria-live polite; keyboard dismiss; focus management
- [ ] Implement announcer line scheduler with priority (finish > interrupter > ability > overtake > lap > anti_spam > story/banter)
- [ ] Event-to-voiceline mapping: deterministic seed optional to vary runs without repetition fatigue
- [ ] Audio asset pipeline hooks: integrate generator stub under `sounds/` for lifeweaver/ana (XTTS batch rendering)

## Phase 8 — Testing & Anti-Abuse
- [ ] **Enhanced Testing**:
  - [ ] Unit tests: ability cooldowns, cheer eligibility, determination mechanics, anti-spam logic
  - [ ] Unit tests: single-slot enforcement; join denial if already slotted; reconnect rebinding
  - [ ] Unit tests: AFK auto-boot to spectator at intermission end; mid-race disconnect AI takeover
  - [ ] Simulated load: multiple AI + 1 human; deterministic server tick validation
  - [ ] Spam testing: verify debuff application and clearing
- [ ] WS reconnection & resync snapshot handling
- [ ] Rate-limiting & abuse checks for all endpoints
- [ ] Performance testing with 6 AI + visual effects
 - [ ] Chat flood control (rate limits, cooldown UI)
 - [ ] debug filter Event log: debug shows render budget holds 60fps with heavy event bursts

## Phase 9 — Deployment & Integration
- [ ] Publish Workers + Durable Objects with Wrangler
- [ ] Verify WSS connectivity from GitHub Pages origin
- [ ] Point frontend to backend URL (env/config)
- [ ] Document setup: env variables, commands, config flags
- [ ] Integration testing: full flow from session creation to race completion

## Phase 10 — Monitoring & Optimization
- [ ] Minimal structured logging for lifecycle and tick performance
- [ ] Optimize tick interval and payload sizes (delta updates)
- [ ] (Optional) Persist viewer count history (KV/DO storage)
- [ ] Performance monitoring for complex voiceline queue system
 - [ ] Event log throughput metrics and dropped-message counters

---

## Milestones
- [x] **M1**: Session creation + WS echo working
- [ ] **M2**: Server race simulation with AI fill and enhanced mechanics (no client)
- [ ] **M3**: Client ellipse track renders live positions with VFX
- [ ] **M4**: Full game loop with cheer-only-own, cooldowns, and scoring
- [ ] **M5**: Complete voiceline system with interrupts and announcer UI
- [ ] **M6**: Deployed Workers + GitHub Pages with all features

---

## Complex Integration Notes & Future Considerations

### Advanced Mechanics Documentation
- **Determination System**: Complex interaction between overtake events, debuff chance calculation, cheer timing windows, and mitigation effectiveness. Requires careful balance testing to ensure engaging but not frustrating gameplay.

- **Pace Profiles**: Each profile affects racer performance curves across race stages:
  - `front_runner`: Strong early game, gradual slowdown
  - `pace_chaser`: Consistent performance throughout
  - `late_surger`: Slow start, strong mid-to-late acceleration  
  - `end_sprinter`: Explosive final stretch performance

### Voiceline System Complexity
- **Queue Management**: Priority system for different event types, interrupt handling, speaker consistency for follow-ups
- **Context Awareness**: Voicelines should reference current race state, character relationships, recent events

### Technical Considerations
- **WebSocket Delta Optimization**: Critical for performance with 6 active racers + VFX + real-time events. Consider compression for larger payloads.
- **VFX Performance**: Multiple simultaneous visual effects (buffs, debuffs, overtakes) may impact client performance on lower-end devices.
- **Race Determinism**: Server tick must be deterministic for fair gameplay; careful with random number generation and float precision.
 - **Chat/Event Log WS Protocol**: Separate channels or single stream with type field; client filters into tabs; backpressure handling.

### UI/UX Polish
- **Responsive Design**: Ensure all new elements (announcer dialogue, VFX, enhanced panels) work across screen sizes
- **Accessibility**: Consider colorblind-friendly indicators for buff/debuff states, audio cues for visual effects
- **Animation Timing**: Coordinate VFX timing with audio cues and voiceline delivery for maximum impact
 - **Event Log Layout**: Left-docked by default; collapsible; respect existing `styles.css` spacing and z-index rules

### Scalability & Performance
- **Durable Objects Limits**: Monitor memory usage per session, consider cleanup strategies for long-running sessions
- **Concurrent Sessions**: Plan for multiple simultaneous races without cross-contamination
- **Audio Asset Management**: Efficient loading/caching of voiceline files, especially for storytime content

### Development Strategy
- **Iterative Implementation**: Core mechanics first, then layer on complexity (VFX, advanced voicelines)
- **A/B Testing Opportunities**: Different cooldown timings, debuff mechanics, voiceline frequencies
- **Modular Architecture**: Ensure systems can be independently updated/improved without full redeployment

