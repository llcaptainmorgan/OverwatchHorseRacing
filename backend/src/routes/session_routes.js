// ################################################################################
// # SessionDO Routes & Server Orchestration (Cloudflare Durable Object)
// #
// # Sections:
// # 1) Constructor & Session State
// # 2) fetch() Router & HTTP Endpoints
// # 3) Race Creation & AI Fill
// # 4) Cheer Handling (ownership, cooldowns, anti-spam)
// # 5) State Composition & Event Queue
// # 6) Tick Loop & Inactivity Shutdown
// # 7) WebSocket Handling (viewer count & heartbeat)
// # 8) Broadcast Helpers & Utilities
// # 9) Character DB Helpers
// # 10) Join/Leave/Select/Lock-in
// # 11) CORS Helper
// ################################################################################
import { RACE_SETTINGS } from '../config/settings.js';
import { Race, Racer } from '../services/race_engine.js';
import characterDatabase from '../data/character_database.json' assert { type: 'json' };

export class SessionDO {
  // 1) Constructor & Session State
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.allowedOrigin = env?.ALLOWED_ORIGIN || '*';
    this.session = {
      code: null,
      phase: 'intermission',
      players: {},
      spectators: 0,
      viewerCount: 0,
      timers: { intermission: RACE_SETTINGS.intermission_duration_sec, race: 0, results: 0, starting_race: 0 },
      race_distance: RACE_SETTINGS.race_distance,
      takenCharacters: new Set(),
      created_at: Date.now(),
      expires_at: Date.now() + 3 * 60 * 60 * 1000, // 3 hours TTL
    };
    this.race = null;
    this.sockets = new Set();
    this.loopActive = false; // lifecycle loop
    // AI control and presence tracking
    this.aiControlledRacers = new Set();
    this.aiCheerTimersMs = new Map();
    this.lastPlayerActivityAt = Date.now();
    this.shutdownAfterMs = 2 * 60 * 1000; // 2 minutes inactivity
    this.sessionClosing = false;
    this.playerPoints = {}; // userId -> accumulated session points
    this.raceOwnership = {}; // normalized racer name -> userId for current race
    // Basic rate limiting buckets
    this.rateLimit = { join: new Map(), cheer: new Map() }; // key -> [timestamps]

    // Start lifecycle loop
    this.startLifecycleLoop();
  }

  // 2) fetch() Router & HTTP Endpoints
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
    this._requestOrigin = request.headers.get('Origin') || '';

    // CORS preflight
    if (method === 'OPTIONS') {
      return this.cors(new Response(null, { status: 204 }));
    }

    if (url.pathname.endsWith('/stream')) {
      const { 0: client, 1: server } = new WebSocketPair();
      await this.handleWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (method === 'POST' && url.pathname.endsWith('/start_race')) {
      // Rush button: set intermission timer to 15 seconds instead of starting immediately
      if (this.session.phase === 'intermission' && typeof this.session.timers.intermission === 'number') {
        this.session.timers.intermission = 15; // Set to 15 seconds
        this.broadcast({ type: 'state', ...this.composeState() });
        return this.cors(Response.json({ status: 'success', message: 'Race starting in 15 seconds' }));
      }
      // If already racing or in results, try to start immediately
      const ok = this.beginRace();
      if (!ok) return this.cors(Response.json({ status: 'error', message: 'Race already in progress.' }, { status: 400 }));
      return this.cors(Response.json({ status: 'success' }));
    }

    if (method === 'POST' && url.pathname.startsWith('/cheer/')) {
      if (!this.race || !this.race.is_running) return Response.json({ status: 'error', message: 'No active race.' }, { status: 400 });
      const name = decodeURIComponent(url.pathname.split('/').pop());
      const body = await safeJson(request);
      const rlKey = body?.userId || clientIp || 'anon';
      if (this.shouldRateLimit('cheer', rlKey, 3000, 6)) {
        return this.cors(Response.json({ status: 'error', message: 'Rate limit: too many cheers' }, { status: 429 }));
      }
      const res = this.processCheer(name, body?.userId);
      return this.cors(new Response(JSON.stringify(res), { status: res.status === 'success' ? 200 : 400, headers: { 'Content-Type': 'application/json' } }));
    }

    if (method === 'GET' && url.pathname.endsWith('/state')) {
      return this.cors(Response.json(this.composeState()));
    }
    if (method === 'GET' && url.pathname.endsWith('/settings')) {
      return this.cors(Response.json(RACE_SETTINGS));
    }

    if (method === 'POST' && url.pathname.endsWith('/join')) {
      // Basic per-IP join rate limit
      if (this.shouldRateLimit('join', clientIp || 'anon', 60000, 15)) {
        return this.cors(Response.json({ status: 'error', message: 'Rate limit: too many join attempts' }, { status: 429 }));
      }
      const body = await safeJson(request);
      const result = this.joinSession(body);
      return this.cors(new Response(JSON.stringify(result), { status: result.status === 'success' ? 200 : 400, headers: { 'Content-Type': 'application/json' } }));
    }
    if (method === 'POST' && url.pathname.endsWith('/leave')) {
      const body = await safeJson(request);
      const result = this.leaveSession(body);
      return this.cors(new Response(JSON.stringify(result), { status: result.status === 'success' ? 200 : 400, headers: { 'Content-Type': 'application/json' } }));
    }
    if (method === 'POST' && url.pathname.endsWith('/select_character')) {
      const body = await safeJson(request);
      const result = this.selectCharacter(body);
      return this.cors(new Response(JSON.stringify(result), { status: result.status === 'success' ? 200 : 400, headers: { 'Content-Type': 'application/json' } }));
    }
    if (method === 'POST' && url.pathname.endsWith('/lock_in')) {
      const body = await safeJson(request);
      const result = this.lockIn(body);
      return this.cors(new Response(JSON.stringify(result), { status: result.status === 'success' ? 200 : 400, headers: { 'Content-Type': 'application/json' } }));
    }

    return this.cors(new Response('Not Found', { status: 404 }));
  }

  // 3) Race Creation & AI Fill
  createRacersForStart() {
    const selected = [];
    const used = new Set();
    this.aiControlledRacers.clear();
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      const player = this.session.players[slot];
      if (player && player.characterId && player.locked) {
        const charId = this.normalizeName(player.characterId);
        const c = this.getCharacterById(charId);
        used.add(charId);
        const stats = c?.stats || { speed: 50, power: 40, stamina: 90, determination: 70 };
        const displayName = c?.display_name || charId;
        const style = c?.racer_style || c?.racerStyle || 'pace_chaser';
        selected.push(new Racer(displayName, stats.speed, stats.power, stats.stamina, stats.determination ?? 70, style, charId));
      }
    }
    const availableIds = this.getAvailableCharacterIds().filter(id => !used.has(this.normalizeName(id)));
    while (selected.length < RACE_SETTINGS.max_players && availableIds.length) {
      const id = availableIds.shift();
      const c = this.getCharacterById(id);
      const stats = c?.stats || { speed: 50, power: 40, stamina: 90, determination: 70 };
      const displayName = c?.display_name || id;
      const style = c?.racer_style || c?.racerStyle || 'pace_chaser';
      selected.push(new Racer(displayName, stats.speed, stats.power, stats.stamina, stats.determination ?? 70, style, id));
      this.aiControlledRacers.add(this.normalizeName(displayName));
      used.add(this.normalizeName(id));
    }
    while (selected.length < RACE_SETTINGS.max_players) {
      const fallbackId = 'racer' + selected.length;
      selected.push(new Racer(fallbackId, 50, 40, 90, 70, 'pace_chaser', fallbackId));
      this.aiControlledRacers.add(this.normalizeName(fallbackId));
    }
    return selected;
  }

  // 4) Cheer Handling (ownership, cooldowns, anti-spam)
  processCheer(targetName, userId) {
    const racer = this.race.racers.find(r => this.normalizeName(r.name) === this.normalizeName(targetName));
    if (!racer) return { status: 'error', message: 'Racer not found' };
    const slot = this.findSlotByUser(userId);
    if (!slot) return { status: 'error', message: 'Not joined' };
    const player = this.session.players[slot];
    if (!player?.characterId) return { status: 'error', message: 'No character selected' };
    if (this.normalizeName(player.characterId) !== this.normalizeName(racer.name)) return { status: 'error', message: 'Cheer own racer only' };
    const now = Date.now();
    const cd = (player.abilityCooldownSec ?? 12) * 1000;
    if (player.lastCheerAt && now - player.lastCheerAt < cd) return { status: 'error', message: 'On cooldown' };
    player.lastCheerAt = now;
    // Anti-spam: track frequency window; apply brief slow if exceeded
    player._cheerWindow = player._cheerWindow || [];
    const windowMs = 5000;
    const threshold = 3;
    player._cheerWindow = player._cheerWindow.filter(t => now - t < windowMs);
    player._cheerWindow.push(now);
    if (player._cheerWindow.length > threshold) {
      const lbl = racer.applyTemporarySpeed(-3, 1.5, `anti_spam: ${racer.name} overcheered - slowed briefly`);
      if (lbl) this.race.events.push(lbl);
    } else {
      this.race.events.push(...racer.cheer(this.race, { forceAbility: true }));
    }
    return { status: 'success' };
  }

  // 5) State Composition & Event Queue
  composeState() {
    return {
      status: this.race ? (this.race.is_running ? 'running' : 'finished') : 'idle',
      race_clock: this.race ? Math.round(this.race.race_clock * 100) / 100 : 0,
      racers: this.race ? this.race.racers.map(r => r.toJSON()) : [],
      events: this.race ? this.consumeEvents() : [], // Only consume events if race exists
      race_distance: this.session.race_distance,
      phase: this.session.phase,
      viewerCount: this.session.viewerCount,
      players: this.session.players,
      timers: this.session.timers,
      session_meta: { created_at: this.session.created_at, expires_at: this.session.expires_at },
      results: this.race?.results_cached || null,
      // Player points are a map: userId -> { username, points }
      player_points: this.playerPoints,
      // Expose current points table for clients
      points_table: { 1: 50000, 2: 23000, 3: 16000, 4: 3250, 5: 1110, 6: 660 },
    };
  }

  consumeEvents() {
    const e = this.race.events.slice(0);
    this.race.events.length = 0;
    return e;
  }

  // 6) Lifecycle Loop & Inactivity Shutdown
  startLifecycleLoop() {
    if (this.loopActive) {
      console.log(`[Backend] Lifecycle loop already active`);
      return;
    }
    this.loopActive = true;
    console.log(`[Backend] 🚀 Starting lifecycle loop for session ${this.session.id}`);
    const step = () => {
      const dt = RACE_SETTINGS.tick_interval_ms / 1000;
      
      // Log lifecycle loop is running (every 10 seconds to avoid spam)
      if (!this._lastLifecycleLog || Date.now() - this._lastLifecycleLog > 10000) {
        console.log(`[Backend] 🔄 Lifecycle loop step: phase=${this.session.phase}, race exists=${!!this.race}, is_running=${this.race?.is_running}`);
        this._lastLifecycleLog = Date.now();
      }
      
      if (this.session.phase === 'racing') {
        // Log entering racing phase branch
        if (!this._lastLoggedRacingPhase) {
          console.log(`[Backend] 🎯 ENTERING RACING PHASE - race exists: ${!!this.race}, is_running: ${this.race?.is_running}`);
          this._lastLoggedRacingPhase = true;
        }

        if (this.race && this.race.is_running) {
          const beforeClock = this.race.race_clock;
          const beforePositions = this.race.racers.map(r => ({ name: r.name, pos: r.position }));

          try {
            this.race.tick(dt);
            const afterClock = this.race.race_clock;
            const afterPositions = this.race.racers.map(r => ({ name: r.name, pos: r.position }));

            // Log position changes for first few ticks
            if (beforeClock < 0.5) {
              console.log(`[Backend] 🔄 TICK: clock ${beforeClock.toFixed(3)}s → ${afterClock.toFixed(3)}s, dt=${dt.toFixed(3)}s`);
              beforePositions.forEach((before, idx) => {
                const after = afterPositions[idx];
                if (before.pos !== after.pos) {
                  console.log(`[Backend]   ${before.name}: ${before.pos.toFixed(2)}m → ${after.pos.toFixed(2)}m (+${(after.pos - before.pos).toFixed(2)}m)`);
                }
              });
            }

            // AI cheering is handled automatically in race.tick() - no need to call separately
            // this.runAiCheers(RACE_SETTINGS.tick_interval_ms); // Function doesn't exist - removed
            this.session.timers.race = Math.round(this.race.race_clock * 100) / 100;

            // Debug: log every 10 ticks (1 second) to avoid spam
            if (Math.floor(afterClock * 10) % 10 === 0) {
              console.log(`[Backend] 🏃 Race tick: clock=${afterClock.toFixed(1)}s, positions:`,
                this.race.racers.map(r => `${r.name}:${r.position.toFixed(1)}m`).join(', '));
            }

            this.broadcast({ type: 'state', ...this.composeState() });
          } catch (error) {
            console.error(`[Backend] ❌ ERROR in race.tick():`, error);
            console.error(`[Backend] Error stack:`, error.stack);
            // Continue loop even if tick fails
          }
        } else {
          // Log why race tick isn't running
          if (!this.race) {
            console.warn(`[Backend] ⚠️ Phase is 'racing' but race object is null!`);
          } else if (!this.race.is_running) {
            console.log(`[Backend] ℹ️ Race exists but is_running=false, transitioning to results`);
          }
        }

        if (this.race && !this.race.is_running) {
          // Log why race ended
          const maxPos = Math.max(...this.race.racers.map(r => r.position || 0));
          const finishedCount = this.race.finish_order?.length || 0;
          console.log(`[Backend] 🏁 Race ended: finish_order.length=${finishedCount}, max_position=${maxPos.toFixed(1)}m, clock=${this.race.race_clock.toFixed(2)}s`);
          
          // Safety check: Don't transition to results if race ended instantly (bug prevention)
          if (maxPos < 1.0 && this.race.race_clock < 0.5) {
            console.error(`[Backend] ❌ RACE ENDED INSTANTLY - BUG DETECTED! Resetting race...`);
            console.error(`[Backend]   finish_order:`, this.race.finish_order.map(r => ({ name: r.name, pos: r.position })));
            // Reset race state instead of ending
            this.race.is_running = true;
            this.race.finish_order = [];
            this.race.racers.forEach(r => { r.finished = false; r.finish_time = null; });
            return; // Don't transition to results
          }
          
          // Transition to results phase
          this.session.phase = 'results';
          if (!this.session.timers.results || this.session.timers.results <= 0) {
            this.session.timers.results = 8;
            console.log(`[Backend] 🏁 Transitioning to results phase, timer set to ${this.session.timers.results}s`);
          }
          // Accumulate points for session
          try { this.accumulatePoints(); } catch {}
          this.broadcast({ type: 'state', ...this.composeState() });
        }
      } else if (this.session.phase === 'results') {
        if (this.session.timers.results > 0) {
          this.session.timers.results = Math.max(0, this.session.timers.results - dt);
          // Log every second to track results phase
          if (Math.floor(this.session.timers.results) !== Math.floor((this.session.timers.results + dt))) {
            console.log(`[Backend] 📊 Results phase: timer=${this.session.timers.results.toFixed(1)}s`);
          }
          if (Math.floor(this.session.timers.results * 10) % 5 === 0) {
            // occasional broadcast
            this.broadcast({ type: 'state', ...this.composeState() });
          }
          if (this.session.timers.results <= 0) {
            console.log(`[Backend] ✅ Results phase complete, transitioning to intermission`);
            this.toIntermission();
          }
        } else {
          console.warn(`[Backend] ⚠️ Results phase timer is 0 or missing, transitioning to intermission immediately`);
          this.toIntermission();
        }
      } else if (this.session.phase === 'starting_race') {
        // 10-second countdown before race starts
        if (typeof this.session.timers.starting_race === 'number') {
          const prevSecond = Math.ceil(this.session.timers.starting_race);
          this.session.timers.starting_race = Math.max(0, this.session.timers.starting_race - dt);
          const currentSecond = Math.ceil(this.session.timers.starting_race);
          
          // Broadcast every second during countdown
          if (prevSecond !== currentSecond && currentSecond > 0) {
            this.broadcast({ type: 'event', message: `ON YOUR MARK... GET SET... ${currentSecond}` });
            this.broadcast({ type: 'state', ...this.composeState() });
          }
          
          if (this.session.timers.starting_race <= 0) {
            // Countdown finished - start the race
            this.startRaceNow();
          }
        } else {
          // No timer set, start immediately
          this.startRaceNow();
        }
      } else if (this.session.phase === 'intermission') {
        if (typeof this.session.timers.intermission === 'number') {
          this.session.timers.intermission = Math.max(0, this.session.timers.intermission - dt);
          // Broadcast once per whole-second boundary when due (not every 100ms tick
          // for an entire second while floor%5===0 — that spam amplified panel flicker).
          const floored = Math.floor(this.session.timers.intermission);
          if (floored % 5 === 0 && floored !== this._lastIntermissionBroadcastSec) {
            this._lastIntermissionBroadcastSec = floored;
            this.broadcast({ type: 'state', ...this.composeState() });
          }
          if (this.session.timers.intermission <= 0) {
            this.beginRace();
          }
        }
      }
      // Reset phase logging flag when phase changes
      const currentPhase = this.session.phase;
      if (this._lastPhase !== currentPhase) {
        this._lastLoggedRacingPhase = false;
        this._lastPhase = currentPhase;
      }

      // Session TTL enforcement
      if (Date.now() >= this.session.expires_at) {
        this.broadcast({ type: 'event', message: 'Session expired (3 hours). Closing...' });
        this.shutdownSession('TTL expired');
        return;
      }
      // Inactivity shutdown
      if (this.countPlayers && this.countPlayers() === 0 && Date.now() - this.lastPlayerActivityAt > this.shutdownAfterMs) {
        this.shutdownSession && this.shutdownSession('No players present for 2 minutes');
        return;
      }

      // Ensure loop continues even if errors occur
      try {
        setTimeout(step, RACE_SETTINGS.tick_interval_ms);
      } catch (error) {
        console.error(`[Backend] ❌ ERROR in lifecycle loop setTimeout:`, error);
        // Restart loop after error
        setTimeout(step, RACE_SETTINGS.tick_interval_ms);
      }
    };
    setTimeout(step, RACE_SETTINGS.tick_interval_ms);
  }

  beginRace() {
    if (this.race && this.race.is_running) return false;
    // Auto-boot AFK: remove players not locked
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      const p = this.session.players[slot];
      if (!p) continue;
      if (!p.locked) {
        const charKey = p?.characterId ? this.normalizeName(p.characterId) : null;
        if (charKey) this.session.takenCharacters.delete(charKey);
        delete this.session.players[slot];
      }
    }
    
    // Fill empty slots with AI bots before creating racers
    this.fillEmptySlotsWithAI();
    
    // Check if we have enough players (at least 1 locked player)
    let hasLockedPlayers = false;
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      const p = this.session.players[slot];
      if (p && p.locked) {
        hasLockedPlayers = true;
        break;
      }
    }
    if (!hasLockedPlayers) return false; // Can't start without at least one locked player
    
    // Start 10-second countdown phase instead of immediately racing
    this.session.phase = 'starting_race';
    this.session.timers.starting_race = 10; // 10-second countdown
    this.session.timers.intermission = 0; // Clear intermission timer
    this.session.timers.race = 0;
    this.session.timers.results = 0;
    
    // Don't create race yet - wait for countdown
    // Ownership map for scoring (will be set when race actually starts)
    this.raceOwnership = {};
    
    // Broadcast countdown start (no events since race doesn't exist yet)
    this.broadcast({ type: 'state', ...this.composeState() });
    return true;
  }
  
  // Fill empty player slots with AI bots
  fillEmptySlotsWithAI() {
    const availableIds = this.getAvailableCharacterIds();
    const used = new Set();
    
    // Track which characters are already taken (from existing players AND takenCharacters Set)
    // This ensures no duplicates even if frontend somehow allows it
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      const p = this.session.players[slot];
      if (p && p.characterId) {
        const normId = this.normalizeName(p.characterId);
        used.add(normId);
      }
    }
    
    // Also add all characters from takenCharacters Set (includes locked characters)
    if (this.session.takenCharacters && this.session.takenCharacters.size > 0) {
      for (const charId of this.session.takenCharacters) {
        used.add(this.normalizeName(charId));
      }
    }
    
    // Fill empty slots with AI
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      if (!this.session.players[slot]) {
        // Find an available character (not in used Set AND not in takenCharacters)
        const available = availableIds.filter(id => {
          const normId = this.normalizeName(id);
          return !used.has(normId) && !this.session.takenCharacters.has(normId);
        });
        
        if (available.length === 0) break; // No more characters available
        
        const charId = available[Math.floor(Math.random() * available.length)];
        const c = this.getCharacterById(charId);
        const displayName = c?.display_name || charId;
        const normId = this.normalizeName(charId);
        
        // Create AI player entry
        this.session.players[slot] = {
          userId: null,
          username: displayName,
          avatar: null,
          characterId: charId,
          locked: true,
          ai: true,
          lastCheerAt: 0,
          abilityCooldownSec: c?.ability?.cooldown_sec || 12
        };
        
        // Mark as used and add to takenCharacters
        used.add(normId);
        this.session.takenCharacters.add(normId);
      }
    }
    
    // Broadcast updated players
    this.broadcast({ type: 'session_update', players: this.session.players });
  }
  
  // Actually start the race (called after countdown)
  startRaceNow() {
    const racers = this.createRacersForStart();
    if (!racers.length) {
      console.error(`[Backend] ❌ Cannot start race: no racers created`);
      return false;
    }

    console.log(`[Backend] 🚀 STARTING RACE with ${racers.length} racers:`, racers.map(r => r.name).join(', '));

    // Log racer initial stats
    racers.forEach((r, idx) => {
      console.log(`[Backend]   Racer ${idx}: ${r.name} - speed=${r.base_speed}, power=${r.power}, stamina=${r.stamina}, position=${r.position}`);
    });

    this.race = new Race(racers);
    
    // Verify race creation
    console.log(`[Backend] ✅ Race object created:`, {
      exists: !!this.race,
      is_running: this.race?.is_running,
      race_clock: this.race?.race_clock,
      racers_count: this.race?.racers?.length || 0,
      initial_positions: this.race?.racers?.map(r => ({ name: r.name, pos: r.position })) || []
    });

    if (!this.race) {
      console.error(`[Backend] ❌ Race object is null after creation!`);
      return false;
    }

    if (!this.race.is_running) {
      console.error(`[Backend] ❌ Race created but is_running=false! Expected true.`);
    }

    this.session.phase = 'racing';
    this.session.timers.race = 0;
    this.session.timers.results = 0;

    // Ownership map for scoring
    this.raceOwnership = {};
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      const p = this.session.players[slot];
      if (p && p.locked && p.characterId) {
        this.raceOwnership[this.normalizeName(p.characterId)] = p.userId || null;
      }
    }

    console.log(`[Backend] 🎯 Race initialized, phase set to 'racing', lifecycle loop should be active: ${this.loopActive}`);
    
    // Ensure lifecycle loop is running
    if (!this.loopActive) {
      console.warn(`[Backend] ⚠️ Lifecycle loop not active! Starting it now...`);
      this.startLifecycleLoop();
    }

    // Broadcast race start event (only once)
    this.broadcast({ type: 'event', message: '====== RACE HAS BEGUN! ======' });
    this.broadcast({ type: 'state', ...this.composeState() });
    return true;
  }

  accumulatePoints() {
    if (!this.race?.results_cached) return;
    const res = this.race.results_cached;
    for (const row of (res.placements || [])) {
      const key = this.normalizeName(row.name);
      const uid = this.raceOwnership[key];
      if (!uid) continue;
      const pts = Number(row.points || 0) || 0;
      const uname = Object.values(this.session.players).find(p => p?.userId === uid)?.username || null;
      this.playerPoints[uid] = { points: (this.playerPoints[uid]?.points || 0) + pts, username: this.playerPoints[uid]?.username || uname || 'Unknown' };
    }
  }

  toIntermission() {
    this.race = null;
    this.raceOwnership = {};
    this.aiControlledRacers.clear();
    this.aiCheerTimersMs.clear();
    // Reset players: keep humans, clear AI placeholders and selections/locks
    for (let slot = 1; slot <= RACE_SETTINGS.max_players; slot++) {
      const p = this.session.players[slot];
      if (!p) continue;
      if (p.ai) { delete this.session.players[slot]; continue; }
      p.locked = false;
      p.characterId = null;
    }
    this.session.takenCharacters.clear();
    this.session.phase = 'intermission';
    this.session.timers.intermission = RACE_SETTINGS.intermission_duration_sec;
    this.session.timers.results = 0;
    this.session.timers.starting_race = 0;
    this.broadcast({ type: 'state', ...this.composeState() });
  }

  // 7) WebSocket Handling (viewer count & heartbeat)
  async handleWebSocket(ws) {
    ws.accept();
    this.sockets.add(ws);
    this.session.viewerCount++;
    ws.addEventListener('close', () => {
      this.sockets.delete(ws);
      this.session.viewerCount = Math.max(0, this.session.viewerCount - 1);
    });
    ws.addEventListener('message', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data && data.type === 'ping') this.lastPlayerActivityAt = Date.now();
        // Basic chat handling: { type: 'chat', text, userId, username }
        if (data && data.type === 'chat') {
          const now = Date.now();
          const text = (data.text || '').toString().trim();
          if (!text) return;
          // Rate-limit chat per user or IP
          const rlKey = data.userId || 'anon';
          if (this.shouldRateLimit('chat', rlKey, 5000, 8)) {
            return;
          }
          const userId = (data.userId || '').toString();
          const username = (data.username || 'Unknown').toString().slice(0, 48);
          // Determine role: trainer if currently owns a slot, else viewer (spectator may be added later)
          const slot = userId ? this.findSlotByUser(userId) : null;
          const role = slot ? 'trainer' : 'viewer';
          const payload = {
            type: 'chat',
            t: now,
            from: { userId: userId || null, username, role },
            text: text.slice(0, 240)
          };
          this.broadcast(payload);
        }
      } catch {}
    });
    try { ws.send(JSON.stringify({ type: 'state', ...this.composeState() })); } catch {}
  }

  // 8) Broadcast Helpers & Utilities
  broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const sock of this.sockets) { try { sock.send(data); } catch {} }
  }

  findRacerByKey(nameKey) {
    if (!this.race) return null;
    return this.race.racers.find(r => this.normalizeName(r.name) === nameKey) || null;
  }

  countPlayers() {
    let count = 0;
    for (let i = 1; i <= RACE_SETTINGS.max_players; i++) { if (this.session.players[i]) count++; }
    return count;
  }

  shutdownSession(reason = 'Inactivity') {
    if (this.sessionClosing) return;
    this.sessionClosing = true;
    this.loopActive = false;
    try { this.broadcast({ type: 'event', message: `Session closing: ${reason}` }); } catch {}
    for (const sock of this.sockets) { try { sock.close(1000, 'Session closed'); } catch {} }
    this.sockets.clear();
    this.race = null;
    this.session.players = {};
    this.session.takenCharacters = new Set();
    this.aiControlledRacers.clear();
    this.aiCheerTimersMs.clear();
  }

  // 9) Character DB Helpers
  normalizeName(n) { return (n || '').toString().toLowerCase().replace(/[\s\.:]/g, ''); }
  findSlotByUser(userId) { for (let i = 1; i <= RACE_SETTINGS.max_players; i++) { const p = this.session.players[i]; if (p?.userId === userId) return i; } return null; }
  getDefaultNamePool() { return this.getAvailableCharacterIds(); }

  getAvailableCharacterIds() {
    const out = [];
    const chars = characterDatabase?.characters || {};
    for (const [id, c] of Object.entries(chars)) {
      if (c && c.available) out.push(id);
    }
    return out;
  }

  getCharacterById(id) {
    const key = this.normalizeName(id);
    const chars = characterDatabase?.characters || {};
    return chars[key] || null;
  }

  // 10) Join/Leave/Select/Lock-in
  joinSession({ userId, username, preferredSlot, avatar } = {}) {
    if (!userId || !username) return { status: 'error', message: 'userId and username required' };
    const existing = this.findSlotByUser(userId);
    if (existing) { this.lastPlayerActivityAt = Date.now(); return { status: 'success', slot: existing }; }
    let slotToUse = null;
    if (preferredSlot && !this.session.players[preferredSlot]) slotToUse = preferredSlot;
    if (!slotToUse) for (let i = 1; i <= RACE_SETTINGS.max_players; i++) if (!this.session.players[i]) { slotToUse = i; break; }
    if (!slotToUse) return { status: 'success', role: 'spectator' };
    // Try to derive avatar from request context (if proxied through Worker with auth cookie)
    this.session.players[slotToUse] = { userId, username, avatar: avatar || null, characterId: null, locked: false, lastCheerAt: 0, abilityCooldownSec: 12 };
    this.broadcast({ type: 'session_update', players: this.session.players });
    this.lastPlayerActivityAt = Date.now();
    return { status: 'success', slot: slotToUse };
  }

  leaveSession({ userId } = {}) {
    const slot = this.findSlotByUser(userId);
    if (!slot) return { status: 'error', message: 'Not joined' };
    const p = this.session.players[slot];
    const charKey = p?.characterId ? this.normalizeName(p.characterId) : null;
    if (this.race && this.race.is_running && charKey) {
      // Convert to AI placeholder for the remainder of the race
      this.session.players[slot] = { userId: null, username: 'AI', characterId: charKey, locked: true, ai: true, abilityCooldownSec: p?.abilityCooldownSec || 12 };
      this.aiControlledRacers.add(charKey);
      this.aiCheerTimersMs.set(charKey, 1000 + Math.floor(Math.random() * 2000));
    } else {
      if (charKey) this.session.takenCharacters.delete(charKey);
      delete this.session.players[slot];
    }
    this.broadcast({ type: 'session_update', players: this.session.players });
    if (this.countPlayers && this.countPlayers() === 0) this.lastPlayerActivityAt = Date.now();
    return { status: 'success' };
  }

  selectCharacter({ userId, characterId } = {}) {
    if (!userId || !characterId) return { status: 'error', message: 'userId and characterId required' };
    const slot = this.findSlotByUser(userId);
    if (!slot) return { status: 'error', message: 'Not joined' };
    const p = this.session.players[slot];
    if (p.locked) return { status: 'error', message: 'Already locked' };
    const key = this.normalizeName(characterId);
    if (this.session.takenCharacters.has(key)) return { status: 'error', message: 'Character taken' };
    const character = this.getCharacterById(key);
    if (!character) return { status: 'error', message: 'Character not found' };
    if (!character.available) return { status: 'error', message: 'Character not available' };
    if (p.characterId) this.session.takenCharacters.delete(this.normalizeName(p.characterId));
    p.characterId = key;
    // set per-ability cooldown if defined
    const cd = Number(character?.ability?.cooldown_sec);
    if (!Number.isNaN(cd) && cd > 0) p.abilityCooldownSec = cd;
    this.session.takenCharacters.add(key);
    this.broadcast({ type: 'selection_update', slot, characterId });
    this.lastPlayerActivityAt = Date.now();
    return { status: 'success' };
  }

  lockIn({ userId } = {}) {
    const slot = this.findSlotByUser(userId);
    if (!slot) return { status: 'error', message: 'Not joined' };
    const p = this.session.players[slot];
    if (!p.characterId) return { status: 'error', message: 'No character selected' };
    p.locked = true;
    this.broadcast({ type: 'lock_in', slot });
    this.lastPlayerActivityAt = Date.now();
    return { status: 'success' };
  }

  // 11) CORS Helper
  resolveCorsOrigin() {
    const origin = this._requestOrigin || '';
    const configured = (this.env?.ALLOWED_ORIGIN || '').trim();
    const isLocal = (() => {
      try {
        const u = new URL(origin);
        return (u.protocol === 'http:' || u.protocol === 'https:') &&
          (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
      } catch { return false; }
    })();
    const isPages = (() => {
      try {
        const u = new URL(origin);
        return u.protocol === 'https:' && (u.hostname === 'github.io' || u.hostname.endsWith('.github.io'));
      } catch { return false; }
    })();
    if (origin && isLocal) return origin;
    if (origin && isPages) return origin;
    if (origin && configured && configured !== '*' && origin === configured) return origin;
    if (configured && configured !== '*') return configured;
    return origin || 'http://127.0.0.1:8081';
  }

  cors(response) {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', this.resolveCorsOrigin());
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  shouldRateLimit(kind, key, windowMs, maxHits) {
    try {
      const buckets = this.rateLimit?.[kind] || null;
      if (!buckets) return false;
      const now = Date.now();
      const windowStart = now - windowMs;
      const list = buckets.get(key) || [];
      const filtered = list.filter(t => t >= windowStart);
      filtered.push(now);
      buckets.set(key, filtered);
      return filtered.length > maxHits;
    } catch { return false; }
  }
}

export async function safeJson(request) { try { return await request.json(); } catch { return null; } }


