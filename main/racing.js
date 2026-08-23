/**
 * OHR Racing System - Uma Musume Style Horse Racing Game
 * 
 * GAME OVERVIEW:
 * - 1600m elliptical race track with fixed camera
 * - 6 Discord users control 6 Overwatch horse characters
 * - Characters have stats: Speed, Power, Stamina
 * - Characters have unique abilities triggered by random cheer effects
 * - 2D pixelated characters with directional sprite flipping
 * - Event triggers when characters pass each other
 * - Race ends when LAST character finishes (not first)
 * - Point/time system for 1st-6th place rankings
 *
 * IMPORTANT: Server-authoritative runtime
 * - All core race calculations (positions, laps, finishes, points, anti-spam, cooldowns) run on the backend.
 * - This client renders state streamed from the server and triggers local VFX/HUD only.
 * - Sections that look like a local engine are scaffolding for future offline sims and are not active at runtime.
 */

// ################################################################################
// # DEBUG FLAG SYSTEM
// ################################################################################

// IFRACEDEBUG flag - enable verbose logging and debug styling
// Can be set via:
//   1. URL query parameter: ?ifracedebug=true
//   2. localStorage: localStorage.setItem('IFRACEDEBUG', 'true')
//   3. Global variable: window.IFRACEDEBUG = true
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const localStorageValue = localStorage.getItem('IFRACEDEBUG');
    const globalValue = window.IFRACEDEBUG;
    
    window.IFRACEDEBUG = urlParams.get('ifracedebug') === 'true' || 
                         localStorageValue === 'true' || 
                         globalValue === true;
    
    if (window.IFRACEDEBUG) {
        console.log('[Racing] 🐛 IFRACEDEBUG mode enabled - verbose logging and debug styling active');
    }
})();

// ################################################################################
// # SECTION 1: CORE RACING CLASS & INITIALIZATION
// ################################################################################

class OHRRacingSystem {
    constructor() {
        // Race Configuration
        this.raceDistance = 1600; // meters total race distance
        this.trackLapDistance = 400; // meters per lap (4 laps total)
        this.maxRaceDuration = 300; // 5 minute safety limit
        
        // Game State
        this.isRacing = false;
        this.raceStartTime = null;
        this.raceEndTime = null;
        this.currentLap = 1;
        
        // Racer Management
        this.racers = []; // Array of 6 racer objects
        this.finishedRacers = []; // Array storing finish order and times
        this.racePositions = []; // Current live race positions
        
        // Track System
        this.trackSystem = null;
        this.trackWidth = 800; // Canvas/track width (will be updated from DOM)
        this.trackHeight = 400; // Canvas/track height (will be updated from DOM)
        
        // Initialize track dimensions from DOM on first access
        this._trackDimensionsInitialized = false;
        this._debugMode = false; // Set to true for visual debugging
        // Visual path SoT: main/ui_config.js → trackPath (not server path_config)
        this.pathConfig = { ...(window.UI_CONFIG && window.UI_CONFIG.trackPath) };
        /**
         * Ellipse knobs: edit main/ui_config.js trackPath.
         * URL overrides for live tests:
         *    path_cx, path_cy, path_rx, path_ry, path_hp, path_vp, path_sa, path_cs, path_ls, path_csy, path_bl
         */
        try {
            const url = new URL(window.location.href);
            const qp = (k) => url.searchParams.get(k);
            const toNum = (v) => (v === null ? null : Number(v));
            const overrides = {
                centerX: toNum(qp('path_cx')),
                centerY: toNum(qp('path_cy')),
                radiusX: toNum(qp('path_rx')),
                radiusY: toNum(qp('path_ry')),
                horizontalPerspective: toNum(qp('path_hp')),
                verticalPerspective: toNum(qp('path_vp')),
                startAngle: toNum(qp('path_sa')),
                columnSpacing: toNum(qp('path_cs')),
                laneSpacing: toNum(qp('path_ls')),
                columnShiftY: toNum(qp('path_csy')),
                backstretchLift: toNum(qp('path_bl')),
            };
            Object.keys(overrides).forEach((k) => {
                if (typeof overrides[k] === 'number' && !Number.isNaN(overrides[k])) {
                    this.pathConfig[k] = overrides[k];
                }
            });
        } catch {}
        this._spriteImageKeys = [];
        this._spriteLayoutCache = [];
        this._spriteFlipState = [];
        // Event System
        this.eventTriggers = []; // Store passing events for commentary
        this.passEventHistory = []; // Track who passed whom when
        
        // Performance Tracking
        this.raceTimer = 0;
        this.animationFrame = null;
        
        // Container caching to avoid repeated DOM queries
        this._containers = {
            raceGame: null,
            track: null,
            sprites: null
        };
        
        // DOM query cache per update cycle
        this._domCache = {};
        
        this.init().catch(err => {
            console.error('Failed to initialize racing system:', err);
        });
    }
    
    // ################################################################################
    // # HELPER METHODS - Container Management
    // ################################################################################
    
    _getContainer(id) {
        if (id === 'race-game-container') {
            if (!this._containers.raceGame) {
                this._containers.raceGame = document.getElementById('race-game-container');
            }
            return this._containers.raceGame;
        } else if (id === 'race-track') {
            if (!this._containers.track) {
                this._containers.track = document.getElementById('race-track');
            }
            return this._containers.track;
        } else if (id === 'racing-characters') {
            if (!this._containers.sprites) {
                this._containers.sprites = document.getElementById('racing-characters');
            }
            return this._containers.sprites;
        }
        return document.getElementById(id);
    }
    
    _ensureContainerVisible(containerId, options = {}) {
        const el = this._getContainer(containerId);
        if (!el) return false;
        
        const defaults = {
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            zIndex: options.zIndex || null,
            pointerEvents: options.pointerEvents || 'none'
        };
        
        el.style.display = defaults.display;
        el.style.visibility = defaults.visibility;
        el.style.opacity = defaults.opacity;
        if (defaults.zIndex !== null) el.style.zIndex = String(defaults.zIndex);
        if (defaults.pointerEvents) el.style.pointerEvents = defaults.pointerEvents;
        
        return true;
    }
    
    _checkContainerVisibility(containerId) {
        const el = this._getContainer(containerId);
        if (!el) return { visible: false, exists: false };
        
        const computed = window.getComputedStyle(el);
        const visible = computed.display !== 'none' && 
                       computed.visibility !== 'hidden' && 
                       parseFloat(computed.opacity) > 0;
        
        return {
            visible,
            exists: true,
            display: computed.display,
            visibility: computed.visibility,
            opacity: computed.opacity,
            zIndex: computed.zIndex,
            rect: el.getBoundingClientRect()
        };
    }
    
    _setSpriteVisibility(sprite, visible) {
        if (!sprite) return;
        sprite.style.display = visible ? 'flex' : 'none';
        sprite.style.opacity = visible ? '1' : '0';
        sprite.style.visibility = visible ? 'visible' : 'hidden';
    }
    
    _logContainerStatus(containerId, prefix = '[Racing]') {
        const status = this._checkContainerVisibility(containerId);
        if (status.exists) {
            console.log(`${prefix} ${containerId}: display=${status.display}, visibility=${status.visibility}, opacity=${status.opacity}, bounds=${status.rect.width.toFixed(0)}x${status.rect.height.toFixed(0)}`);
        } else {
            console.warn(`${prefix} ${containerId} not found`);
        }
        return status;
    }
    
    _updateTrackDimensions() {
        const trackContainer = this._getContainer('race-track');
        if (!trackContainer) {
            if (window.IFRACEDEBUG) {
                console.warn('[Racing] Track container not found for dimension update');
            }
            return false;
        }
        
        const rect = trackContainer.getBoundingClientRect();
        const oldWidth = this.trackWidth;
        const oldHeight = this.trackHeight;
        
        // Wait a frame if dimensions are 0 (container might not be laid out yet)
        if (rect.width === 0 || rect.height === 0) {
            if (window.IFRACEDEBUG) {
                console.warn('[Racing] Track container has zero dimensions, will retry on next frame');
            }
            return false; // Indicate retry needed
        }
        
        // Use actual track container dimensions for positioning
        const trackComputed = window.getComputedStyle(trackContainer);
        const actualWidth = rect.width || parseFloat(trackComputed.width) || 800;
        const actualHeight = rect.height || parseFloat(trackComputed.height) || 400;
        
        this.trackWidth = actualWidth;
        this.trackHeight = actualHeight;
        
        if (oldWidth !== this.trackWidth || oldHeight !== this.trackHeight) {
            console.log(`[Racing] 📐 Track dimensions updated: ${this.trackWidth.toFixed(0)}x${this.trackHeight.toFixed(0)} (was ${oldWidth.toFixed(0)}x${oldHeight.toFixed(0)})`);
            
            if (window.IFRACEDEBUG) {
                console.log('[Racing] Track dimensions:', {
                    rect: { width: rect.width.toFixed(2), height: rect.height.toFixed(2) },
                    final: { width: this.trackWidth.toFixed(2), height: this.trackHeight.toFixed(2) },
                    changed: oldWidth !== this.trackWidth || oldHeight !== this.trackHeight
                });
            }
            this._trackDimensionsInitialized = true;
        }
        
        return true;
    }

    async init() {
        // Prevent double connect (constructor must be the only caller).
        if (this._backendStreamStarted) return;
        this._backendStreamStarted = true;
        // Initialize racing system
        // Load character database from game engine
        // Set up track rendering system
        // Initialize event listeners for cheer system
        // Set up Discord panel integration
        console.log('OHR Racing System initialized');

        // Minimal event log wiring (non-disruptive)
        this.eventLog = document.getElementById('event-log-list');
        this.eventTabs = document.querySelectorAll('.event-tab');
        this.currentLogFilter = 'all';
        // Track auto-scroll pin state: only autoscroll when user is at bottom
        this._logPinnedToBottom = true;
        if (this.eventLog) {
            const updatePinned = () => {
                try {
                    const el = this.eventLog;
                    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
                    // Consider within 8px from bottom as pinned
                    this._logPinnedToBottom = distanceFromBottom < 8;
                } catch {}
            };
            // Initialize and subscribe
            updatePinned();
            this.eventLog.addEventListener('scroll', updatePinned);
        }
        // Chat UI
        this.chatInput = document.getElementById('event-chat-input');
        this.chatSendBtn = document.getElementById('event-chat-send');
        if (this.chatSendBtn && this.chatInput) {
            this.chatSendBtn.addEventListener('click', () => this.sendChat());
            this.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
            });
        }
        if (this.eventTabs && this.eventTabs.length) {
            this.eventTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    this.eventTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentLogFilter = tab.dataset.tab;
                    this.applyEventLogFilter();
                });
            });
        }

        // Collapsible event log panel (backup; primary binder lives in index.html)
        this.eventLogPanel = document.getElementById('event-log-panel');
        this.eventLogToggle = document.getElementById('event-log-toggle');
        if (this.eventLogPanel && this.eventLogToggle && this.eventLogToggle.dataset.collapseWired !== '1') {
            this.eventLogToggle.dataset.collapseWired = '1';
            const applyCollapsed = (collapsed) => {
                this.eventLogPanel.classList.toggle('collapsed', collapsed);
                this.eventLogToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                this.eventLogToggle.title = collapsed ? 'Expand event log' : 'Collapse event log';
                this.eventLogToggle.textContent = collapsed ? '›' : '‹';
                try { localStorage.setItem('ohr_event_log_collapsed', collapsed ? '1' : '0'); } catch {}
            };
            let collapsed = false;
            try { collapsed = localStorage.getItem('ohr_event_log_collapsed') === '1'; } catch {}
            applyCollapsed(collapsed);
            this.eventLogToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                applyCollapsed(!this.eventLogPanel.classList.contains('collapsed'));
            });
        }

        // Connect to backend if configured
        if (window.backendClient && window.BACKEND_CONFIG?.features?.raceVisualsFromServer) {
            try {
                await window.backendClient.ensureSession();
                console.log('[Racing] Establishing WebSocket connection...');
                const ws = window.backendClient.stream((msg) => this.handleBackendMessage(msg));
                // Note: WebSocket handlers are already set up in backend_client.js
                // We can add additional logging via addEventListener (preferred) or override handlers
                // Using addEventListener to avoid interfering with existing handlers
                ws.addEventListener('open', () => {
                    console.log('[Racing] WebSocket connected successfully');
                });
                ws.addEventListener('error', (err) => {
                    console.error('[Racing] WebSocket error:', err);
                });
                ws.addEventListener('close', () => {
                    console.warn('[Racing] WebSocket closed');
                });
                const snapshot = await window.backendClient.getState();
                this.applyState(snapshot);
                try { window._lastServerState = snapshot; } catch {}
            } catch (e) {
                console.warn('[Racing] Backend not connected yet:', e);
            }
        }
    }

    sendChat() {
        if (!this.chatInput) return;
        const text = (this.chatInput.value || '').trim();
        if (!text) return;
        const ws = window.backendClient && window.backendClient.socket;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        // Pull Discord user from backend /auth/me cache if available via discordIntegration
        const user = (window.discordIntegration && window.discordIntegration.localUser) || null;
        const userId = user?.id || null;
        const username = user?.username || 'Unknown';
        ws.send(JSON.stringify({ type: 'chat', text, userId, username }));
        this.chatInput.value = '';
    }

    appendEventLog(entry) {
        if (!this.eventLog) return;
        const { type = 'system', message = '', time = new Date(), chat } = entry;
        const group = type === 'chat' ? 'chat' : 'events';
        if (this.currentLogFilter !== 'all' && this.currentLogFilter !== group) return;
        const row = document.createElement('div');
        row.className = 'event-item';
        row.dataset.group = group;
        if (type === 'chat' && chat) {
            const tsStr = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'chat-username';
            nameSpan.textContent = chat.username;
            const roleBadge = document.createElement('span');
            roleBadge.className = `chat-badge badge-${chat.role}`;
            roleBadge.textContent = `[${chat.role.toUpperCase()}]`;
            const msgSpan = document.createElement('span');
            msgSpan.className = 'chat-text';
            msgSpan.textContent = chat.text;
            const ts = document.createElement('span');
            ts.className = 'event-time';
            ts.textContent = tsStr;
            row.appendChild(ts);
            row.appendChild(document.createTextNode(' | '));
            row.appendChild(nameSpan);
            row.appendChild(document.createTextNode(' '));
            row.appendChild(roleBadge);
            row.appendChild(document.createTextNode(': '));
            row.appendChild(msgSpan);
        } else {
            const badge = document.createElement('span');
            badge.className = `event-badge badge-${type}`;
            badge.textContent = type.toUpperCase();
            const textNode = document.createElement('span');
            textNode.textContent = message;
            const ts = document.createElement('span');
            ts.className = 'event-time';
            ts.textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time);
            row.appendChild(badge);
            row.appendChild(textNode);
            row.appendChild(ts);
        }
        const shouldStick = this._logPinnedToBottom === true;
        this.eventLog.appendChild(row);
        // Virtualize only when pinned to avoid scroll jumps mid-read
        const maxItems = 250;
        if (shouldStick) {
            while (this.eventLog.children.length > maxItems) {
                this.eventLog.removeChild(this.eventLog.firstChild);
            }
        }
        if (shouldStick) {
            this.eventLog.scrollTop = this.eventLog.scrollHeight;
        }
    }

    applyEventLogFilter() {
        if (!this.eventLog) return;
        const mode = this.currentLogFilter || 'all';
        const children = Array.from(this.eventLog.children);
        children.forEach((row) => {
            const group = row.dataset.group || 'events';
            row.style.display = (mode === 'all' || mode === group) ? '' : 'none';
        });
        this.eventLog.scrollTop = this.eventLog.scrollHeight;
    }

    handleIntermissionElements(phase) {
        // Show/hide intermission elements based on phase
        if (phase === 'intermission') {
            // Show hanging sign and timer (timer created by game_engine.js on init)
            if (window.ohrGameEngine) {
                try {
                    if (window.ohrGameEngine.showHangingSign) {
                        window.ohrGameEngine.showHangingSign();
                    }
                    const timerDisplay = document.getElementById('intermission-timer');
                    if (timerDisplay) {
                        timerDisplay.style.display = 'block';
                        timerDisplay.style.opacity = '1';
                    }
                } catch (err) {
                    console.warn('[Racing] Failed to show intermission elements:', err);
                }
            }
        } else {
            // Hide intermission elements when leaving intermission phase
            if (window.ohrGameEngine && window.ohrGameEngine.hideIntermissionElements) {
                try {
                    window.ohrGameEngine.hideIntermissionElements();
                } catch (err) {
                    console.warn('[Racing] Failed to hide intermission elements:', err);
                }
            }
        }
    }

    handleBackendMessage(msg) {
        this._lastBackendMessageTime = Date.now();
        this._backendMessageCount = (this._backendMessageCount || 0) + 1;

        if (window.IFRACEDEBUG) {
            console.log(`[Racing] ===== BACKEND MESSAGE #${this._backendMessageCount} RECEIVED =====`, {
                type: msg.type,
                phase: msg.phase,
                racersCount: msg.racers?.length || 0,
                hasRacers: Array.isArray(msg.racers) && msg.racers.length > 0,
                raceClock: msg.race_clock,
                raceDistance: msg.race_distance,
                allRacers: msg.racers?.map((r, idx) => ({
                    idx,
                    name: r.name,
                    position: typeof r.position === 'number' ? r.position.toFixed(2) : r.position,
                    distance: typeof r.distance === 'number' ? r.distance.toFixed(2) : r.distance
                })) || []
            });
        }

        // Extra logging for race phase messages (only in debug mode)
        if (window.IFRACEDEBUG && msg.type === 'state' && msg.phase === 'racing' && msg.racers) {
            console.log(`[Racing] 🎯 RACE UPDATE: clock=${msg.race_clock}, racers moving:`,
                msg.racers.map(r => `${r.name}:${r.position.toFixed(1)}m`).join(', '));

            // Check if positions are changing
            if (!this._lastPositions) this._lastPositions = {};
            let positionsChanged = false;
            msg.racers.forEach(r => {
                if (this._lastPositions[r.name] !== r.position) {
                    positionsChanged = true;
                }
                this._lastPositions[r.name] = r.position;
            });
            if (!positionsChanged && msg.race_clock > 0) {
                console.warn(`[Racing] ⚠️ POSITIONS NOT CHANGING! Clock=${msg.race_clock}, all positions:`,
                    msg.racers.map(r => `${r.name}=${r.position}`).join(', '));
            }
        }
        
        if (msg.type === 'state') {
            // Log phase transitions (always show these - they're important)
            if (this._lastPhase !== msg.phase) {
                console.log(`[Racing] 🔄 PHASE TRANSITION: ${this._lastPhase || 'none'} → ${msg.phase}`);
                this._lastPhase = msg.phase;
                // Reset position logging flag when starting a new race
                if (msg.phase === 'starting_race' || msg.phase === 'racing') {
                    this._firstPositionLogged = false;
                }
                
                // Show/hide intermission elements based on phase
                this.handleIntermissionElements(msg.phase);
            }

            // Debug logging for state updates (only in debug mode)
            if (window.IFRACEDEBUG && (msg.phase === 'racing' || msg.phase === 'starting_race') && Array.isArray(msg.racers) && msg.racers.length > 0) {
                if (!this._raceStateCount) this._raceStateCount = 0;
                this._raceStateCount++;

                if (this._raceStateCount <= 3 || (!this._lastRaceLogTime || Date.now() - this._lastRaceLogTime > 1000)) {
                    console.log(`[Racing] STATE UPDATE #${this._raceStateCount}:`, {
                        phase: msg.phase,
                        racersCount: msg.racers.length,
                        clock: msg.race_clock,
                        racers: msg.racers.map(r => ({
                            name: r.name,
                            position: r.position,
                            finished: r.finished
                        }))
                    });
                    this._lastRaceLogTime = Date.now();
                }
            }
            this.applyState(msg);
            try { window._lastServerState = msg; } catch {}
            try { document.dispatchEvent(new CustomEvent('serverState', { detail: msg })); } catch {}
            if (Array.isArray(msg.events)) {
                msg.events.forEach(ev => {
                    const type = this.classifyEvent(ev);
                    this.appendEventLog({ type, message: ev });
                    // drive panel VFX for buffs/debuffs/abilities and overtakes/laps
                    this.applyPanelVfxFromEvent(ev, type);
                });
            }
            // Sync panel ownership/selection and game phase
            if (window.discordIntegration) {
                if (msg.players) window.discordIntegration.applyServerPlayers(msg.players);
                if (msg.phase) window.discordIntegration.updateGameState(msg.phase);
                if (typeof msg.timers?.intermission === 'number') {
                    // Update local intermission timer display if using server timers
                    try {
                        if (window.ohrGameEngine && window.ohrGameEngine.useServerTimers) {
                            window.ohrGameEngine.intermissionTimer = Math.max(0, Math.floor(msg.timers.intermission));
                            const el = document.getElementById('timer-value');
                            if (el) el.textContent = window.ohrGameEngine.formatTime(window.ohrGameEngine.intermissionTimer);
                            // When timer reaches 0 and overlay is open, auto-lock
                            if (window.ohrGameEngine.intermissionTimer === 0) {
                                const ov = document.getElementById('character-selection-overlay');
                                if (ov && !ov.classList.contains('hidden') && window.characterSelection?.autoLockIfNeeded) {
                                    window.characterSelection.autoLockIfNeeded();
                                }
                            }
                        }
                    } catch {}
                }
                // Reflect taken characters in selection UI
                try {
                    if (msg.players && window.characterSelection && window.characterSelection.setTakenCharactersFromPlayers) {
                        window.characterSelection.setTakenCharactersFromPlayers(msg.players);
                    }
                } catch {}
            }
        } else if (msg.type === 'event') {
            this.appendEventLog({ type: 'system', message: msg.message });
        } else if (msg.type === 'chat') {
            const when = typeof msg.t === 'number' ? new Date(msg.t) : new Date();
            const from = msg.from || {};
            this.appendEventLog({ type: 'chat', chat: { username: from.username || 'Unknown', role: from.role || 'viewer', text: msg.text || '' }, time: when });
        } else if (msg.type === 'session_update') {
            if (window.discordIntegration && msg.players) {
                // Emit join/leave notifications by diffing player maps
                try {
                    const prev = (window._lastPlayersMap || {});
                    const curr = msg.players || {};
                    // Detect joins
                    for (let i = 1; i <= 6; i++) {
                        const before = prev[i];
                        const after = curr[i];
                        if (!before && after && (after.username || after.userId)) {
                            const name = after.username || `User ${i}`;
                            window.notify && window.notify(`${name} joined the session ^^`, 'join');
                            // Event log: join
                            this.appendEventLog({ type: 'system', message: `${name} joined the session.` });
                        }
                        if (before && !after) {
                            const name = before.username || `User ${i}`;
                            window.notify && window.notify(`${name} has left the session o/`, 'leave');
                            // Event log: leave
                            this.appendEventLog({ type: 'system', message: `${name} has left the session.` });
                        }
                        // AI takeover detection (mid-race leave)
                        if (before && before.userId && after && !after.userId && after.ai) {
                            const name = before.username || `User ${i}`;
                            const charId = after.characterId || before.characterId || '';
                            const label = charId ? `${charId}` : `slot ${i}`;
                            this.appendEventLog({ type: 'system', message: `AI takeover: ${label} is now AI-controlled (was ${name}).` });
                        }
                    }
                    window._lastPlayersMap = JSON.parse(JSON.stringify(curr));
                } catch {}
                window.discordIntegration.applyServerPlayers(msg.players);
                // Update taken characters from session map
                try { if (window.characterSelection?.setTakenCharactersFromPlayers) window.characterSelection.setTakenCharactersFromPlayers(msg.players); } catch {}
            }
        } else if (msg.type === 'selection_update') {
            if (window.discordIntegration && typeof msg.slot === 'number' && msg.characterId) {
                window.discordIntegration.applySelectionUpdate(msg.slot, msg.characterId);
            }
            // Mark selected character as taken in UI
            try { if (window.characterSelection?.markCharacterTaken) window.characterSelection.markCharacterTaken(msg.characterId, true); } catch {}
        } else if (msg.type === 'lock_in') {
            if (window.discordIntegration && typeof msg.slot === 'number') {
                window.discordIntegration.applyLockIn(msg.slot);
            }
            // Ensure taken list remains consistent
            try {
                const last = window._lastPlayersMap || {};
                const slot = msg.slot;
                const charId = last && last[slot] && last[slot].characterId;
                if (charId && window.characterSelection?.markCharacterTaken) window.characterSelection.markCharacterTaken(charId, true);
            } catch {}
        }
    }

    classifyEvent(ev) {
        if (typeof ev !== 'string') return 'system';
        if (ev.startsWith('finish:')) return 'finish';
        if (ev.startsWith('overtake:')) return 'overtake';
        if (ev.startsWith('ability:')) return 'ability';
        if (ev.startsWith('buff_apply:')) return 'ability';
        if (ev.startsWith('lap:')) return 'system';
        if (ev.startsWith('anti_spam:')) return 'debuff';
        if (ev.startsWith('buff_expire:')) return 'system';
        if (ev.startsWith('cheer:')) return 'system';
        return 'system';
    }

    applyPanelVfxFromEvent(ev, type) {
        if (!window.discordIntegration || typeof ev !== 'string') return;
        const di = window.discordIntegration;
        const extractName = (s) => (s || '').split(/:|\]|!|\n/).join(' ').replace(/[^A-Za-z0-9:\s_\-\.'\u00C0-\u017F]/g,'').trim();
        try {
            if (type === 'ability') {
                // ability: NAME uses XYZ
                const m = ev.match(/^ability:\s+([^\s].*?)\s/);
                const name = m ? m[1] : null;
                const pid = di.findPanelIdByRacerName(name);
                if (pid) di.applyBannerVfx(pid, 'ability');
                this.applyRacerVfx(name, 'ability');
            } else if (ev.startsWith('buff_apply:')) {
                const m = ev.match(/^buff_apply:\s+([^\s].*?)\s/);
                const name = m ? m[1] : null;
                const pid = di.findPanelIdByRacerName(name);
                if (pid) di.applyBannerVfx(pid, 'buff');
                this.applyRacerVfx(name, 'buff');
            } else if (ev.startsWith('overtake:')) {
                // overtake: [A] overtakes [B]!
                const m = ev.match(/overtake:\s*\[(.*?)\]\s*overtakes\s*\[(.*?)\]/i);
                if (m) {
                    const a = m[1];
                    const b = m[2];
                    const pidB = di.findPanelIdByRacerName(b);
                    if (pidB) di.applyBannerVfx(pidB, 'debuff');
                    this.applyRacerVfx(b, 'debuff');
                }
            } else if (ev.startsWith('anti_spam:')) {
                // anti_spam: NAME overcheered - slowed briefly
                const m = ev.match(/^anti_spam:\s+([^\s].*?)\s/);
                const name = m ? m[1] : null;
                if (name) {
                    const pid = di.findPanelIdByRacerName(name);
                    if (pid) di.applyBannerVfx(pid, 'debuff');
                    this.applyRacerVfx(name, 'anti');
                }
            }
        } catch {}
    }

    applyRacerVfx(racerName, kind) {
        if (!Array.isArray(this._sprites)) return;
        // maintain a cached list of normalized last names for mapping
        if (!this._lastNames && this._sprites.length) {
            this._lastNames = new Array(this._sprites.length).fill('');
        }
        const norm = (s) => (s || '').toString().toLowerCase().replace(/[\s\.:]/g, '');
        const key = norm(racerName);
        // Refresh names mapping by reading current image alts or placeholder text
        this._lastNames = this._sprites.map((el, i) => {
            const img = el.querySelector('img.racer-img');
            return norm(img?.alt) || String(i + 1);
        });
        const idx = this._lastNames.indexOf(key);
        if (idx === -1) return;
        const el = this._sprites[idx];
        // Ring glow — skip if same kind is already playing (prevents blink on rapid events)
        const vfxCooldownMs = 900;
        const now = Date.now();
        const lastKind = el.dataset.vfxKind || '';
        const lastTs = Number(el.dataset.vfxTs || 0);
        if (lastKind === kind && now - lastTs < vfxCooldownMs) return;
        el.dataset.vfxKind = kind;
        el.dataset.vfxTs = String(now);

        let vfx = el.querySelector('.racer-vfx');
        if (!vfx) {
            vfx = document.createElement('div');
            vfx.className = 'racer-vfx';
            el.appendChild(vfx);
        }
        const cls = kind === 'buff' ? 'vfx-buff' : kind === 'debuff' ? 'vfx-debuff' : 'vfx-anti-spam';
        vfx.classList.add(cls);
        setTimeout(() => vfx.classList.remove(cls), 1200);

        // Particle burst
        const burst = document.createElement('div');
        burst.className = 'vfx-burst ' + (kind === 'buff' ? 'vfx-burst--buff' : kind === 'debuff' ? 'vfx-burst--debuff' : 'vfx-burst--spam');
        el.appendChild(burst);
        setTimeout(() => { if (burst.parentNode) burst.parentNode.removeChild(burst); }, 650);

        // Tinted overlay flash
        const overlay = document.createElement('div');
        overlay.className = 'racer-overlay ' + (kind === 'buff' ? 'racer-overlay--buff' : kind === 'debuff' ? 'racer-overlay--debuff' : 'racer-overlay--spam');
        el.appendChild(overlay);
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 720);
    }

    applyState(state) {
        // Draw racers on an elliptical track using server positions
        // Render racers during starting_race, racing, and intermission phases (for countdown visibility)
        const isRaceActive = state && (state.phase === 'racing' || state.phase === 'starting_race' || state.phase === 'intermission');
        
        if (window.IFRACEDEBUG) {
            console.log('[Racing] applyState called:', {
                phase: state?.phase,
                isRaceActive,
                racersCount: state?.racers?.length || 0,
                hasRacers: Array.isArray(state?.racers) && state.racers.length > 0
            });
        }
        
        if (isRaceActive && Array.isArray(state.racers) && state.racers.length > 0) {
            if (window.IFRACEDEBUG) {
                console.log('[Racing] ===== APPLYING RACE STATE =====');
                console.log('[Racing] State data:', {
                    phase: state.phase,
                    racersCount: state.racers.length,
                    racerNames: state.racers.map(r => r.name),
                    firstRacerPosition: state.racers[0]?.position
                });
            }
            
            // Ensure race-game-container is visible during race
            this._ensureContainerVisible('race-game-container', { zIndex: 10 });
            this._logContainerStatus('race-game-container', '[Racing] 🎮');
            
            // Update track dimensions FIRST before creating sprites
            if (!this._updateTrackDimensions()) {
                // Retry on next frame if dimensions are zero
                const stateCopy = JSON.parse(JSON.stringify(state));
                requestAnimationFrame(() => {
                    if (this._updateTrackDimensions()) {
                        this.applyState(stateCopy);
                    } else {
                        console.error('[Racing] Track container still has zero dimensions after retry');
                    }
                });
                return;
            }
            
            this.ensureSprites(state.racers);
            
            // Show sprites when race starts
            if (this._sprites) {
                this._sprites.forEach((sprite) => {
                    this._setSpriteVisibility(sprite, true);
                });
            }
            
            // Position sprites with logging
            // Log position changes to verify updates are happening
            if (!this._lastRacerPositions) this._lastRacerPositions = {};
            const positionChanges = [];
            
            // Always log that we're about to position sprites
            if (window.IFRACEDEBUG) {
                console.log(`[Racing] Positioning ${state.racers.length} sprites (track: ${this.trackWidth}x${this.trackHeight})`);
            }
            
            state.racers.forEach((r, idx) => {
                const distance = r.position || 0;
                const lastPos = this._lastRacerPositions[r.name] || 0;
                if (Math.abs(distance - lastPos) > 0.1) {
                    positionChanges.push(`${r.name}: ${lastPos.toFixed(1)}m → ${distance.toFixed(1)}m`);
                }
                this._lastRacerPositions[r.name] = distance;
                
                const raceDistance = state.race_distance || 1600;
                let pos;
                
                try {
                    pos = this.convertDistanceToEllipse(
                        distance, 
                        raceDistance,
                        idx, // racer index for column alignment
                        state.racers.length // total racers for column spacing
                    );
                } catch (err) {
                    console.error(`[Racing] Error calculating position for racer ${idx}:`, err);
                    // Fallback: place sprite at center-bottom of track (starting line)
                    pos = {
                        x: this.trackWidth / 2,
                        y: this.trackHeight * 0.9, // Near bottom
                        scale: 1,
                        flip: false
                    };
                }
                
                if (window.IFRACEDEBUG) {
                    console.log(`[Racing] Racer ${idx} (${r.name}):`, {
                        distance: distance.toFixed(2),
                        raceDistance: raceDistance.toFixed(2),
                        position: { x: pos.x.toFixed(2), y: pos.y.toFixed(2), scale: pos.scale, flip: pos.flip },
                        inBounds: pos.x >= 0 && pos.x <= this.trackWidth && pos.y >= 0 && pos.y <= this.trackHeight,
                        trackSize: { width: this.trackWidth.toFixed(2), height: this.trackHeight.toFixed(2) }
                    });
                }
                
                // If position is way out of bounds, use fallback
                if (pos.x < -100 || pos.x > this.trackWidth + 100 || pos.y < -100 || pos.y > this.trackHeight + 100) {
                    if (window.IFRACEDEBUG) {
                        console.warn(`[Racing] Racer ${idx} position out of bounds, using fallback`);
                    }
                    pos = {
                        x: this.trackWidth / 2 + (idx - state.racers.length / 2) * 30,
                        y: this.trackHeight * 0.9,
                        scale: 1,
                        flip: false
                    };
                }
                
                if (window.IFRACEDEBUG && idx < 2) {
                    console.log(`[Racing] positionSprite(${idx}) for ${r.name}`);
                }
                this.positionSprite(idx, pos);
            });
            
            // Always log first position update to verify sprites are being positioned
            if (!this._firstPositionLogged && state.racers.length > 0) {
                const firstRacer = state.racers[0];
                const firstPos = state.racers[0]?.position || 0;
                console.log(`[Racing] 🎯 First sprite positioned: ${firstRacer.name} at ${firstPos.toFixed(1)}m, track=${this.trackWidth}x${this.trackHeight}`);
                this._firstPositionLogged = true;
            }
            
            // Log if positions changed (only in debug mode)
            if (window.IFRACEDEBUG) {
                if (positionChanges.length > 0) {
                    console.log(`[Racing] ✅ POSITION UPDATES RECEIVED (${positionChanges.length} racers moved):`, positionChanges.join(', '));
                } else if (state.phase === 'racing' && state.race_clock > 0.5) {
                    console.warn(`[Racing] ⚠️ NO POSITION CHANGES! Clock=${state.race_clock.toFixed(1)}s, all positions:`, 
                        state.racers.map(r => `${r.name}=${r.position.toFixed(1)}m`).join(', '));
                }
            }
            
            // Mark that we're in racing mode
            this.isRacing = true;
            
            // Final summary log after all sprites positioned (only in debug mode)
            if (window.IFRACEDEBUG) {
                const raceGameStatus = this._checkContainerVisibility('race-game-container');
                const trackStatus = this._checkContainerVisibility('race-track');
                const spritesStatus = this._checkContainerVisibility('racing-characters');
                
                const spritesInViewportCount = this._sprites ? this._sprites.filter(s => {
                    if (!s) return false;
                    const rect = s.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && 
                           rect.top < window.innerHeight && rect.bottom > 0 &&
                           rect.left < window.innerWidth && rect.right > 0;
                }).length : 0;
                
                console.log('[Racing] ===== RACE STATE APPLICATION COMPLETE =====', {
                    phase: state.phase,
                    racersCount: state.racers.length,
                    spritesCreated: this._sprites?.length || 0,
                    trackDimensions: { width: this.trackWidth.toFixed(2), height: this.trackHeight.toFixed(2) },
                    raceGameContainerVisible: raceGameStatus.visible,
                    trackContainerVisible: trackStatus.visible,
                    spritesContainerVisible: spritesStatus.visible,
                    spritesInViewport: spritesInViewportCount
                });
            }
        } else {
            // Clear racers during results phase only
            if (state && state.phase !== 'racing' && state.phase !== 'starting_race' && state.phase !== 'intermission') {
                this.isRacing = false;
                // Hide race game container during results only
                const raceGameContainer = this._getContainer('race-game-container');
                if (raceGameContainer) {
                    raceGameContainer.style.display = 'none';
                    if (window.IFRACEDEBUG) {
                        console.log('[Racing] Race game container hidden (phase: ' + state.phase + ')');
                    }
                }
                // Hide sprites if needed
                if (this._sprites) {
                    this._sprites.forEach(sprite => {
                        this._setSpriteVisibility(sprite, false);
                    });
                }
                // Reset race state counter for next race
                this._raceStateCount = 0;
            }
        }
        // Update viewer/spectator badges
        if (typeof state?.viewerCount === 'number') {
            const v = document.getElementById('viewer-count');
            if (v) v.textContent = `Viewers: ${state.viewerCount}`;
        }
        {
            const s = document.getElementById('spectator-count');
            const spectatorsVal = (typeof state?.spectators === 'number')
                ? state.spectators
                : (typeof state?.viewerCount === 'number' ? state.viewerCount : null);
            if (s && spectatorsVal !== null) s.textContent = `Spectators: ${spectatorsVal}`;
        }
        // HUD time and laps (show best-known lap estimate)
        if (typeof state?.race_clock === 'number') {
            const timeEl = document.getElementById('race-time');
            if (timeEl) timeEl.textContent = this.formatClock(state.race_clock);
        }
        if (Array.isArray(state?.racers) && state.racers.length) {
            const lapEl = document.getElementById('lap-counter');
            let lapsFromServer = 0;
            if (state.racers.some(r => typeof r.laps === 'number')) {
                lapsFromServer = Math.max(...state.racers.map(r => Number(r.laps || 0)));
            } else {
                const any = state.racers[0];
                lapsFromServer = this.estimateLaps(any?.position || 0, state?.race_distance || 1600, 4) - 1;
            }
            if (lapEl) lapEl.textContent = `Lap ${Math.min(lapsFromServer + 1, 4)} / 4`;
        }
        
        // Update intermission timer display
        if (state?.phase === 'intermission' && typeof state?.timers?.intermission === 'number') {
            if (window.ohrGameEngine) {
                window.ohrGameEngine.intermissionTimer = Math.max(0, Math.floor(state.timers.intermission));
                const timerValueEl = document.getElementById('timer-value');
                if (timerValueEl && window.ohrGameEngine.formatTime) {
                    timerValueEl.textContent = window.ohrGameEngine.formatTime(window.ohrGameEngine.intermissionTimer);
                }
            }
            this._shotClockArmed = false;
            if (window.ohrGameEngine && window.ohrGameEngine.hideShotClock) {
                window.ohrGameEngine.hideShotClock();
            }
        }

        if (state?.phase === 'starting_race') {
            this._shotClockArmed = true;
            const raw = Number(state.timers?.starting_race);
            const sec = Number.isFinite(raw) ? Math.max(1, Math.ceil(raw)) : 10;
            if (window.ohrGameEngine && window.ohrGameEngine.setShotClock) {
                window.ohrGameEngine.setShotClock(sec);
            }
        } else if (state?.phase === 'racing' && this._shotClockArmed) {
            this._shotClockArmed = false;
            if (window.ohrGameEngine && window.ohrGameEngine.setShotClock) {
                window.ohrGameEngine.setShotClock('GO', { go: true });
            }
        } else if (state?.phase && state.phase !== 'starting_race' && state.phase !== 'racing') {
            this._shotClockArmed = false;
            if (window.ohrGameEngine && window.ohrGameEngine.hideShotClock) {
                window.ohrGameEngine.hideShotClock();
            }
        }

        // Scoreboard handling when results are available from server
        if (state?.status === 'finished' && state?.results && !this._scoreboardShown && !this._scoreboardDismissed) {
            this.showScoreboard(state.results);
            this._scoreboardShown = true;
        }
        // Reset scoreboard flag when race phase changes back to intermission
        if (state?.phase === 'intermission' && (this._scoreboardShown || this._scoreboardDismissed)) {
            this._scoreboardShown = false;
            this._scoreboardDismissed = false;
        }
    }

    ensureSprites(racers) {
        const container = this._getContainer('racing-characters');
        if (!container) {
            console.error('[Racing] racing-characters container not found!');
            return;
        }
        
        if (window.IFRACEDEBUG) {
            console.log(`[Racing] ensureSprites called with ${racers.length} racers`);
        }
        
        // Ensure container is visible and properly configured
        this._ensureContainerVisible('racing-characters', { zIndex: 15 });
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.overflow = 'visible';
        
        if (window.IFRACEDEBUG) {
            console.log('[Racing] Container setup:', {
                id: container.id,
                display: container.style.display,
                visibility: container.style.visibility,
                position: container.style.position,
                bounds: {
                    width: container.offsetWidth,
                    height: container.offsetHeight,
                    clientWidth: container.clientWidth,
                    clientHeight: container.clientHeight
                },
                parent: container.parentElement?.id || 'none',
                containerRect: container.getBoundingClientRect(),
                computedStyle: {
                    position: window.getComputedStyle(container).position,
                    left: window.getComputedStyle(container).left,
                    top: window.getComputedStyle(container).top,
                    width: window.getComputedStyle(container).width,
                    height: window.getComputedStyle(container).height
                }
            });
        }
        
        if (!this._sprites) this._sprites = [];
        
        // Create sprites if needed
        while (this._sprites.length < racers.length) {
            const wrap = document.createElement('div');
            wrap.className = 'racer-sprite';
            const img = document.createElement('img');
            img.className = 'racer-img';
            // Ensure image is visible by default
            img.style.display = 'block';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.opacity = '1';
            img.style.visibility = 'visible';
            wrap.appendChild(img);
            container.appendChild(wrap);
            this._sprites.push(wrap);
            
            // Ensure sprite is visible
            this._setSpriteVisibility(wrap, true);
            
            if (window.IFRACEDEBUG) {
                console.log(`[Racing] Created sprite ${this._sprites.length - 1}, now have ${this._sprites.length} sprites`);
            }
        }
        
        // Remove excess sprites
        while (this._sprites.length > racers.length) {
            const el = this._sprites.pop();
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
                if (window.IFRACEDEBUG) {
                    console.log(`[Racing] Removed excess sprite, now have ${this._sprites.length} sprites`);
                }
            }
        }
        this._spriteImageKeys.length = racers.length;
        this._spriteLayoutCache.length = racers.length;
        
        // Verify sprites are in DOM
        const domSprites = container.querySelectorAll('.racer-sprite');
        const containerComputed = window.getComputedStyle(container);
        const containerRect = container.getBoundingClientRect();
        
        if (window.IFRACEDEBUG) {
            console.log(`[Racing] Sprite count: expected=${racers.length}, _sprites=${this._sprites.length}, DOM=${domSprites.length}`);
            console.log('[Racing] Container setup:', {
            containerId: container.id,
            containerDisplay: containerComputed.display,
            containerVisibility: containerComputed.visibility,
            containerOpacity: containerComputed.opacity,
            containerPosition: containerComputed.position,
            containerBounds: {
                width: containerRect.width.toFixed(2),
                height: containerRect.height.toFixed(2),
                x: containerRect.x.toFixed(2),
                y: containerRect.y.toFixed(2)
            },
            containerZIndex: containerComputed.zIndex,
            containerOverflow: containerComputed.overflow,
            parentId: container.parentElement?.id || 'none',
            parentTag: container.parentElement?.tagName || 'none'
            });
        }
        
        if (domSprites.length !== this._sprites.length) {
            console.error('[Racing] Mismatch between _sprites array and DOM!', {
                expected: racers.length,
                _spritesLength: this._sprites.length,
                domLength: domSprites.length
            });
            // Try to fix by recreating sprites
            container.innerHTML = ''; // Clear container
            this._sprites = [];
            // Recreate all sprites
            racers.forEach((r, idx) => {
                const wrap = document.createElement('div');
                wrap.className = 'racer-sprite';
                const img = document.createElement('img');
                img.className = 'racer-img';
                wrap.appendChild(img);
                container.appendChild(wrap);
                this._sprites.push(wrap);
                this.setSpriteImage(idx, r.name);
            });
            if (window.IFRACEDEBUG) {
                console.log(`[Racing] Recreated ${this._sprites.length} sprites after mismatch`);
            }
        }
        
        // Verify each sprite is properly attached (only log errors, not debug info)
        this._sprites.forEach((sprite, idx) => {
            if (!sprite || !sprite.parentNode) {
                console.error(`[Racing] Sprite ${idx} is not attached to DOM!`);
            } else if (sprite.parentNode !== container && window.IFRACEDEBUG) {
                console.warn(`[Racing] Sprite ${idx} parent is ${sprite.parentNode.id}, expected racing-characters`);
            }
        });
        
        // Set images when available
        racers.forEach((r, idx) => {
            if (this._sprites[idx]) {
                this.setSpriteImage(idx, r.name);
            } else {
                console.error(`[Racing] Cannot set image for sprite ${idx} - sprite not found`);
            }
        });
        
        if (window.IFRACEDEBUG) {
            console.log(`[Racing] Ensured ${this._sprites.length} sprites for ${racers.length} racers`);
        }
    }

    setSpriteImage(idx, racerName) {
        const norm = (s) => (s || '').toString().toLowerCase().replace(/[\s\.:']/g, '');
        const id = norm(racerName);
        const el = this._sprites?.[idx];
        if (!el) {
            console.error(`[Racing] Cannot set sprite image for ${racerName}: sprite element not found at index ${idx}`);
            return;
        }

        const img = el.querySelector('img.racer-img');
        if (this._spriteImageKeys[idx] === id && el.classList.contains('has-img') && img?.src) {
            return;
        }
        this._spriteImageKeys[idx] = id;

        let imgEl = img;
        if (!imgEl) {
            imgEl = document.createElement('img');
            imgEl.className = 'racer-img';
            el.appendChild(imgEl);
        }

        let canonId = id;
        if (window.OHRAssets && window.OHRAssets.canonicalizeId) {
            canonId = window.OHRAssets.canonicalizeId(id);
        } else if (window.characterSelection && window.characterSelection.canonicalizeId) {
            canonId = window.characterSelection.canonicalizeId(id);
        }

        // Prefer DB assets when available (correct *_sprite_small / *_small_sprite names)
        let assets = null;
        try {
            const db = window.characterSelection?.characters || {};
            assets = db[canonId]?.assets || db[id]?.assets || null;
        } catch {}

        const spritePaths = (window.OHRAssets && window.OHRAssets.spritePaths)
            ? window.OHRAssets.spritePaths(canonId, assets)
            : [
                `../images/current_roster/${canonId}_sprite_small.png`,
                `../images/current_roster/${canonId}_small_sprite.png`,
            ];

        // Reset chip styles without destroying the <img>
        el.classList.remove('has-img');
        el.style.background = '';
        el.style.borderColor = '';
        el.style.color = '';
        el.querySelectorAll('.character-name').forEach((n) => n.remove());
        // Remove leftover text nodes only
        Array.from(el.childNodes).forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) el.removeChild(n);
        });
        if (!el.contains(imgEl)) el.appendChild(imgEl);

        imgEl.alt = racerName || canonId;
        imgEl.removeAttribute('src');
        imgEl.style.display = 'block';
        imgEl.style.width = '100%';
        imgEl.style.height = '100%';
        imgEl.style.objectFit = 'contain';
        imgEl.style.opacity = '1';
        imgEl.style.visibility = 'visible';

        this._setSpriteVisibility(el, true);
        if (!el.dataset.sizeInit) {
            el.style.width = '64px';
            el.style.height = '64px';
            el.style.minWidth = '64px';
            el.style.minHeight = '64px';
            el.dataset.sizeInit = '1';
        }

        let pathIndex = 0;
        const tryNextPath = () => {
            if (pathIndex >= spritePaths.length) {
                el.classList.remove('has-img');
                imgEl.removeAttribute('src');
                imgEl.style.display = 'none';
                const displayText = (racerName || String(idx + 1)).substring(0, 3).toUpperCase();
                el.title = racerName || canonId;
                let label = el.querySelector('.sprite-fallback-label');
                if (!label) {
                    label = document.createElement('span');
                    label.className = 'sprite-fallback-label';
                    el.appendChild(label);
                }
                label.textContent = displayText;
                return;
            }

            const src = spritePaths[pathIndex];
            imgEl.onload = () => {
                el.classList.add('has-img');
                const label = el.querySelector('.sprite-fallback-label');
                if (label) label.remove();
                imgEl.style.display = 'block';
                this._setSpriteVisibility(el, true);
                if (window.IFRACEDEBUG) {
                    console.log(`[Racing] Sprite ${idx} (${racerName}) loaded: ${imgEl.src}`);
                }
            };
            imgEl.onerror = () => {
                if (window.IFRACEDEBUG) {
                    console.warn(`[Racing] Sprite ${idx} failed: ${src}`);
                }
                pathIndex += 1;
                tryNextPath();
            };
            imgEl.src = src;
        };
        tryNextPath();
    }

    convertDistanceToEllipse(distance, raceDistance, racerIndex = 0, totalRacers = 6) {
        // Validate inputs
        if (!this.trackWidth || !this.trackHeight) {
            console.warn('[Racing] Track dimensions not set, using defaults');
            this.trackWidth = this.trackWidth || 800;
            this.trackHeight = this.trackHeight || 400;
        }
        
        const lapDistance = this.trackLapDistance > 0
            ? this.trackLapDistance
            : (raceDistance > 0 ? raceDistance / 4 : 400);
        const circuits = lapDistance > 0 ? (distance / lapDistance) : 0;
        const angle = this.pathConfig.startAngle - circuits * Math.PI * 2;
        const cx = this.pathConfig.centerX * this.trackWidth;
        const cy = this.pathConfig.centerY * this.trackHeight;
        // Concentric lanes: each racer gets a scaled ellipse; progress t stays equal-distance
        const laneSpacing = (typeof this.pathConfig.laneSpacing === 'number')
            ? this.pathConfig.laneSpacing
            : 0.05;
        const laneScale = 1 + (racerIndex - (totalRacers - 1) / 2) * laneSpacing;
        const rx = this.pathConfig.radiusX * this.trackWidth * this.pathConfig.horizontalPerspective * laneScale;
        const ry = this.pathConfig.radiusY * this.trackHeight * this.pathConfig.verticalPerspective * laneScale;
        
        // Starting line: vertical column down the screen until the first bend, then merge onto lanes
        let offsetX = 0;
        let offsetY = 0;
        const holdFrac = (typeof this.pathConfig.columnHoldLapFrac === 'number')
            ? this.pathConfig.columnHoldLapFrac
            : 0.25;
        const fadeStartFrac = (typeof this.pathConfig.columnFadeStartLapFrac === 'number')
            ? this.pathConfig.columnFadeStartLapFrac
            : 0.18;
        const holdUntil = lapDistance * holdFrac;

        if (distance < holdUntil && totalRacers > 1) {
            const columnSpacing = (typeof this.pathConfig.columnSpacing === 'number')
                ? this.pathConfig.columnSpacing
                : 80;
            const columnShiftY = (typeof this.pathConfig.columnShiftY === 'number')
                ? this.pathConfig.columnShiftY
                : 0;
            offsetX = 0;
            // Slot 0 stays on the racing point; later slots append downward
            offsetY = racerIndex * columnSpacing + columnShiftY;

            const fadeStartDist = lapDistance * fadeStartFrac;
            if (distance > fadeStartDist) {
                const span = Math.max(1e-6, holdUntil - fadeStartDist);
                const fadeFactor = Math.min(1, (distance - fadeStartDist) / span);
                offsetY *= (1 - fadeFactor);
            }
        }
        
        const backLift = (typeof this.pathConfig.backstretchLift === 'number')
            ? this.pathConfig.backstretchLift
            : 0;
        const farWeight = Math.max(0, -Math.sin(angle));
        const baseX = cx + rx * Math.cos(angle);
        const baseY = cy + ry * Math.sin(angle) * (1 + backLift * farWeight);
        const x = baseX + offsetX;
        const y = baseY + offsetY;
        
        // Perspective scale (simple): near bottom larger
        const normY = (y - (this.trackHeight * (1 - this.pathConfig.centerY))) / this.trackHeight;
        const scale = 0.85 + 0.3 * (normY || 0);
        const flip = this.getSpriteFlipFromDistance(distance, raceDistance, racerIndex);
        
        // Debug validation
        if (isNaN(x) || isNaN(y)) {
            console.error('[Racing] Invalid position calculated:', { x, y, cx, cy, rx, ry, angle, offsetX, offsetY });
            // Fallback to center position
            return { x: this.trackWidth / 2, y: this.trackHeight / 2, scale: 1, flip: false };
        }
        
        return { x, y, scale, flip };
    }

    /**
     * Facing follows each visual circuit (400m = one oval).
     * Flip at circuit 1/4 and 3/4 so runners face along the left/right bends.
     */
    getSpriteFlipFromDistance(distance, raceDistance, racerIndex = 0) {
        const lapDistance = this.trackLapDistance > 0
            ? this.trackLapDistance
            : (raceDistance > 0 ? raceDistance / 4 : 400);
        if (!(lapDistance > 0)) return false;
        const lapFrac = (((distance % lapDistance) + lapDistance) % lapDistance) / lapDistance;
        const enter = 0.25;
        const exit = 0.75;
        const hyst = 0.02;
        if (!this._spriteFlipState) this._spriteFlipState = [];
        const prev = !!this._spriteFlipState[racerIndex];
        const inBackstretch = prev
            ? (lapFrac >= enter - hyst && lapFrac < exit + hyst)
            : (lapFrac >= enter && lapFrac < exit);
        this._spriteFlipState[racerIndex] = inBackstretch;
        return !inBackstretch;
    }

    positionSprite(idx, pos) {
        if (!this._sprites || !this._sprites[idx]) {
            console.warn(`[Racing] Sprite ${idx} not found in _sprites array`);
            return;
        }
        const el = this._sprites[idx];
        if (!el) {
            console.warn(`[Racing] Sprite element ${idx} is null`);
            return;
        }
        
        const spriteSize = 64;
        const zIndex = 100 + Math.floor(pos.y / 10);
        const transform = pos.flip
            ? `translateX(-50%) translateY(-50%) scale(${pos.scale}) scaleX(-1)`
            : `translateX(-50%) translateY(-50%) scale(${pos.scale})`;

        const prev = this._spriteLayoutCache[idx];
        const needsPos = !prev || prev.x !== pos.x || prev.y !== pos.y;
        const needsTransform = !prev || prev.flip !== pos.flip || prev.scale !== pos.scale;
        const needsZ = !prev || prev.z !== zIndex;

        if (!needsPos && !needsTransform && !needsZ) return;

        if (needsPos) {
            el.style.left = `${pos.x}px`;
            el.style.top = `${pos.y}px`;
        }
        if (needsTransform) {
            if (pos.flip) {
                el.classList.add('flipped');
            } else {
                el.classList.remove('flipped');
            }
            el.style.transform = transform;
        }
        if (needsZ) {
            el.style.zIndex = String(zIndex);
        }

        if (!el.dataset.sizeInit) {
            el.style.width = `${spriteSize}px`;
            el.style.height = `${spriteSize}px`;
            el.style.minWidth = `${spriteSize}px`;
            el.style.minHeight = `${spriteSize}px`;
            el.style.maxWidth = `${spriteSize}px`;
            el.style.maxHeight = `${spriteSize}px`;
            el.style.fontSize = '12px';
            el.style.pointerEvents = 'none';
            el.dataset.sizeInit = '1';
        }

        this._spriteLayoutCache[idx] = { x: pos.x, y: pos.y, scale: pos.scale, flip: pos.flip, z: zIndex };

        if (el.style.display === 'none' || el.style.visibility === 'hidden') {
            this._setSpriteVisibility(el, true);
        }

        if (window.IFRACEDEBUG && idx < 2 && needsPos) {
            const rect = el.getBoundingClientRect();
            console.log(`[Racing] Sprite ${idx}: left=${pos.x.toFixed(1)}px, top=${pos.y.toFixed(1)}px, flip=${pos.flip}`);
        }
        
        // Add temporary bright debug styling to make sprites obvious (only in debug mode)
        if (window.IFRACEDEBUG) {
            el.style.border = '3px solid #ff00ff'; // Magenta border
            if (!el.classList.contains('has-img')) {
                el.style.background = '#00ffff'; // Cyan background only if no image
            }
            el.style.boxShadow = '0 0 20px #ff00ff, 0 0 40px #00ffff'; // Glowing effect
        }

        // Debug logging for sprites (only in debug mode, simplified)
        if (window.IFRACEDEBUG && idx < 2) {
            const computedStyle = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const container = el.parentElement;
            console.log(`[Racing] SPRITE ${idx}: pos=(${pos.x.toFixed(0)},${pos.y.toFixed(0)}), viewport=(${rect.x.toFixed(0)},${rect.y.toFixed(0)}), display=${computedStyle.display}, parent=${container?.id || 'none'}`);
        }
    }

    formatClock(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const d = Math.floor((seconds * 10) % 10);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
    }

    estimateLaps(distance, raceDistance, totalLaps) {
        const lapDistance = raceDistance / (totalLaps || 4);
        return Math.floor(distance / lapDistance) + 1;
    }

    showScoreboard(results) {
        const modal = document.getElementById('scoreboard-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        const table = document.getElementById('character-results');
        if (table) {
            table.classList.add('scoreboard-table');
            table.innerHTML = '';
            const header = document.createElement('tr');
            header.innerHTML = '<th>Place</th><th>Racer</th><th>Time</th><th>Points</th>';
            table.appendChild(header);
            (results.placements || []).forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td class="position-cell">${row.position}</td><td>${row.name}</td><td>${this.formatClock(row.finish_time || 0)}</td><td>${row.points}</td>`;
                table.appendChild(tr);
            });
        }
        this.bindScoreboardContinue();
        const continueBtn = modal.querySelector('#continue-scoreboard');
        if (continueBtn) {
            // Fresh binding each show (onclick replaces; avoids dead once-listeners)
            continueBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dismissScoreboard();
            };
        }
    }

    bindScoreboardContinue() {
        if (this._scoreboardContinueBound) return;
        this._scoreboardContinueBound = true;
        document.addEventListener('click', (e) => {
            const btn = e.target && (e.target.id === 'continue-scoreboard'
                ? e.target
                : e.target.closest && e.target.closest('#continue-scoreboard'));
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            this.dismissScoreboard();
        });
    }

    dismissScoreboard() {
        const modal = document.getElementById('scoreboard-modal');
        if (modal) modal.classList.add('hidden');
        this._scoreboardDismissed = true;
        this._scoreboardShown = true;
    }
}

// ################################################################################
// # SECTION 2: CHARACTER STATS & ABILITIES SYSTEM
// # NOTE: Handled by backend at runtime. This section is scaffolding only.
// ################################################################################

class RacerCharacter {
    constructor(characterData, discordUser) {
        // Character Info
        this.id = characterData.id;
        this.name = characterData.display_name;
        this.discordUser = discordUser; // Link to Discord panel user
        
        // Racing Stats (Base values from character_database.json)
        this.baseStats = {
            speed: 70,    // Affects top speed and acceleration
            power: 70,    // Affects ability to maintain speed and break through
            stamina: 70   // Affects endurance and speed degradation over distance
        };
        
        // Dynamic Racing Values
        this.currentStats = { ...this.baseStats }; // Modified by boosts/abilities
        this.position = {
            x: 0,
            y: 0,
            trackProgress: 0.0, // 0.0 to 1.0 completion percentage
            distanceCovered: 0, // meters covered
            currentLap: 1
        };
        
        // Movement & Direction
        this.velocity = {
            x: 0,
            y: 0,
            speed: 0 // current speed in m/s
        };
        this.direction = 'right'; // 'left', 'right', 'up', 'down'
        this.isFlipped = false; // For sprite flipping
        
        // Race State
        this.isFinished = false;
        this.finishTime = null;
        this.finishPosition = null; // 1st, 2nd, 3rd, etc.
        
        // Cheer & Ability System
        this.cheerCooldown = 0; // Cooldown between cheer effects
        this.activeBoosts = []; // Array of active temporary boosts
        this.abilityData = characterData.ability; // Character's special ability
        this.lastCheerTime = 0;
        
        // Visual Elements
        this.spriteElement = null;
        this.spriteImage = characterData.assets.racing_sprite;
    }

    // Calculate current effective stats with boosts (server-authoritative; no-op client-side)
    getEffectiveStats() {
        // Apply temporary boosts to base stats
        // Return modified speed/power/stamina values
    }

    // Apply cheer effect (random boost OR ability trigger) — handled by server
    applyCheerEffect() {
        // Random chance between:
        // 1. Stat boost (speed/power/stamina) for random duration
        // 2. Character ability activation with voiceline
    }
}

// ################################################################################
// # SECTION 3: 2D TRACK SYSTEM & ELLIPTICAL PATH CALCULATION
// ################################################################################

class EllipticalTrackSystem {
    constructor(width, height) {
        this.trackWidth = width;
        this.trackHeight = height;
        
        // Elliptical track parameters
        this.centerX = width / 2;
        this.centerY = height / 2;
        this.radiusX = (width * 0.8) / 2; // Horizontal radius
        this.radiusY = (height * 0.6) / 2; // Vertical radius
        
        // Track segments for direction calculation
        this.segments = this.calculateTrackSegments();
        
        // Starting positions (6 racers in column formation)
        this.startingPositions = this.calculateStartingPositions();
    }

    // Calculate X,Y position from track progress (0.0 to 1.0)
    getPositionFromProgress(progress) {
        // Convert progress to angle on ellipse
        // Calculate X,Y coordinates on elliptical path
        // Return {x, y, angle, direction}
    }

    // Determine which direction character should face
    getDirectionInfo(progress) {
        // Calculate tangent direction at current position
        // Determine if sprite should be flipped
        // Return {direction: 'left'|'right'|'up'|'down', flip: boolean}
    }

    // Get starting positions for 6 racers in column formation
    calculateStartingPositions() {
        // Create 6 starting positions in vertical column
        // Position at track start line (front of ellipse)
        // Return array of {x, y, progress} objects
    }

    // Calculate track segments for lap detection
    calculateTrackSegments() {
        // Divide track into segments for:
        // - Lap counting
        // - Direction changes
        // - Passing event detection
    }
}

// ################################################################################
// # SECTION 4: RACE MECHANICS & MOVEMENT PHYSICS
// ################################################################################

class RacePhysics {
    constructor() {
        this.baseSpeed = 8.0; // Base speed in m/s
        this.speedVariation = 0.2; // Random speed variation factor
        this.fatigueFactor = 0.95; // Speed degradation per lap
    }

    // Calculate character speed based on stats and conditions
    calculateSpeed(racer) {
        // Base calculation from speed stat
        // Apply power stat for maintaining speed
        // Apply stamina stat for endurance over distance
        // Add random variation within threshold
        // Apply any active boosts/penalties
        // Return speed in m/s
    }

    // Update racer position each frame
    updateRacerPosition(racer, deltaTime) {
        // Calculate movement distance for this frame
        // Update track progress
        // Convert to X,Y coordinates via track system
        // Handle lap counting
        // Check for race completion
    }

    // Handle character fatigue over race distance
    applyFatigue(racer) {
        // Reduce effective stats based on distance covered
        // Apply stamina stat to resistance
        // More fatigue = slower speeds in later laps
    }

    // Apply temporary boost effects
    applyBoosts(racer) {
        // Process active boost effects
        // Remove expired boosts
        // Calculate net stat modifications
    }
}

// ################################################################################
// # SECTION 5: CHEER SYSTEM & CHARACTER ABILITIES
// ################################################################################

class CheerSystem {
    constructor() {
        this.cheerCooldown = 3000; // 3 second global cooldown
        this.boostDuration = {
            min: 2000, // 2 seconds minimum
            max: 8000  // 8 seconds maximum
        };
        this.boostStrength = {
            min: 1.1, // 10% boost minimum
            max: 1.5  // 50% boost maximum
        };
    }

    // Process cheer from Discord user
    processCheer(racerId, discordUserId) {
        // Verify user owns this racer
        // Check cooldown
        // Apply random effect:
        //   - Random stat boost (speed/power/stamina)
        //   - OR character ability activation
        // Trigger voiceline if ability used
        // Start cooldown timer
    }

    // Generate random stat boost
    generateStatBoost() {
        // Randomly select: speed, power, or stamina
        // Random duration within threshold
        // Random strength within threshold
        // Return boost object
    }

    // Trigger character-specific ability
    triggerCharacterAbility(racer) {
        // Load ability data from character database
        // Apply ability effect (varies per character)
        // Play character voiceline
        // Apply visual effect
        // Examples:
        //   - Mercy: Healing boost to stamina
        //   - Reinhardt: Power charge through other racers
        //   - Tracer: Speed blink forward
    }
}

// ################################################################################
// # SECTION 6: EVENT TRIGGERS & PASSING DETECTION
// ################################################################################

class PassingEventSystem {
    constructor() {
        this.passEvents = []; // Track all passing events
        this.commentaryTriggers = []; // Events that trigger commentary
    }

    // Detect when character_1 passes character_2
    detectPassingEvents(racers) {
        // Compare positions of all racers
        // Identify when relative positions change
        // Generate passing events in format:
        //   {character_1: 'mercy', character_2: 'reinhardt', time: timestamp}
        // Store for commentary system
    }

    // Check for milestone events
    checkMilestoneEvents(racers) {
        // Detect special moments:
        //   - First to complete lap 1, 2, 3
        //   - Close races (within 1 second)
        //   - Dramatic comebacks
        //   - Last place surges
    }

    // Generate commentary data
    generateCommentaryData() {
        // Format passing events for commentary system
        // Use character_1/character_2 format as requested
        // Return data for ana_commentary_master.json integration
    }
}

// ################################################################################
// # SECTION 7: RACE TIMING & SCORING SYSTEM
// ################################################################################

class RaceScoring {
    constructor() {
        this.finishTimes = []; // Store finish times for each racer
        this.pointSystem = {
            1: 10, // 1st place
            2: 8,  // 2nd place
            3: 6,  // 3rd place
            4: 4,  // 4th place
            5: 2,  // 5th place
            6: 1   // 6th place
        };
    }

    // Record racer finish
    recordFinish(racer, finishTime) {
        // Store finish time
        // Calculate position (1st, 2nd, etc.)
        // Assign points based on position
        // Check if race is complete (all 6 finished)
    }

    // Generate final race results
    generateResults() {
        // Sort by finish time
        // Assign final positions
        // Calculate points awarded
        // Format for scoreboard display
        // Return results object:
        //   {position: 1, character: 'mercy', time: '1:23.45', points: 10}
    }

    // Check if race is complete
    isRaceComplete() {
        // Race ends when LAST character finishes (all 6)
        // Not when first character finishes
        return this.finishTimes.length === 6;
    }

    // Format time display (MM:SS.MS)
    formatTime(milliseconds) {
        // Convert to readable format: "1:23.45"
    }
}

// ################################################################################
// # SECTION 8: VISUAL RENDERING & SPRITE MANAGEMENT
// ################################################################################

class RaceRenderer {
    constructor(trackSystem) {
        this.trackSystem = trackSystem;
        this.racingContainer = document.getElementById('racing-characters');
        this.spriteSize = { width: 48, height: 48 }; // Pixelated character size - updated for 800x400 container
    }

    // Create racer sprite elements
    createRacerSprite(racer) {
        // Create DOM element for character sprite
        // Set up image source from racing_sprite asset
        // Position at starting line
        // Add to racing container
    }

    // Update racer visual position
    updateRacerSprite(racer) {
        // Get position from track system
        // Update DOM element position
        // Handle sprite flipping based on direction
        // Apply any visual effects (boosts, abilities)
    }

    // Handle sprite direction flipping
    updateSpriteDirection(racer, directionInfo) {
        // Flip sprite X-scale when direction changes
        // Ensure characters face correct direction around track
        // Apply CSS transform: scaleX(-1) for flipping
    }

    // Render boost/ability visual effects
    renderEffects(racer, effectType) {
        // Show visual feedback for:
        //   - Cheer boosts (colored aura)
        //   - Ability activation (character-specific effect)
        //   - Passing events (brief highlight)
    }
}

// ################################################################################
// # SECTION 9: DISCORD INTEGRATION & MULTIPLAYER
// ################################################################################

class DiscordRaceIntegration {
    constructor() {
        this.connectedUsers = []; // 6 Discord users max
        this.racerAssignments = {}; // Map Discord user to racer character
    }

    // Assign Discord user to racer character
    assignUserToRacer(discordUser, characterId) {
        // Link Discord panel user to specific character
        // Update racer object with Discord user data
        // Enable cheer button for this user
    }

    // Process cheer input from Discord user
    handleCheerInput(discordUserId) {
        // Validate user has assigned character
        // Check cheer cooldown
        // Forward to cheer system
        // Update Discord panel with cooldown timer
    }

    // Update Discord panels with race info
    updateDiscordPanels(raceData) {
        // Update user panels with:
        //   - Current race position
        //   - Character stats/boosts
        //   - Cheer cooldown status
        //   - Live race progress
    }
}

// ################################################################################
// # SECTION 10: MAIN RACE CONTROLLER & PUBLIC API
// ################################################################################

class RaceController {
    constructor() {
        this.racingSystem = new OHRRacingSystem();
        this.trackSystem = new EllipticalTrackSystem(800, 400);
        this.physics = new RacePhysics();
        this.cheerSystem = new CheerSystem();
        this.eventSystem = new PassingEventSystem();
        this.scoring = new RaceScoring();
        this.renderer = new RaceRenderer(this.trackSystem);
        this.discordIntegration = new DiscordRaceIntegration();
        // OHRRacingSystem constructor already calls init() once.
        // Do NOT call init() again — a second stream() leaves an orphaned WebSocket
        // that can deliver stale empty players maps and flicker Discord panels.
    }

    // Start a new race
    startRace(selectedCharacters, discordUsers) {
        // Validate 6 characters selected
        // Create racer objects
        // Position at starting line
        // Begin race timer
        // Start animation loop
        // Notify Discord panels
    }

    // Main animation loop
    updateRaceLoop() {
        // Update physics for all racers
        // Check for passing events
        // Update visual positions
        // Check for race completion
        // Continue loop or end race
    }

    // End race and show results
    endRace() {
        // Stop animation loop
        // Calculate final results
        // Update scoreboard
        // Transition back to intermission
        // Reset for next race
    }

    // Public API for external systems
    processCheer(discordUserId) {
        // External entry point for cheer system
    }

    getCurrentRaceState() {
        // Return current race data for UI updates
    }
}

// ################################################################################
// # SECTION 11: INITIALIZATION & EXPORTS
// ################################################################################

// Initialize racing system when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.ohrRacingSystem = new RaceController();
    console.log('OHR Racing System loaded - ready for Gemini implementation');

    // Always-on CONTINUE handler (does not depend on showScoreboard binding)
    const continueBtn = document.getElementById('continue-scoreboard');
    if (continueBtn) {
        continueBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const modal = document.getElementById('scoreboard-modal');
            if (modal) modal.classList.add('hidden');
            const sys = window.ohrRacingSystem && window.ohrRacingSystem.racingSystem;
            if (sys) {
                sys._scoreboardDismissed = true;
                sys._scoreboardShown = true;
            }
        });
    }
});

// TODO: Integrate with existing systems:
// - game_engine.js (game state management)
// - discord_integration.js (user panels & cheer buttons) 
// - audio_system.js (race sounds & voicelines)
// - character_selection.js (character data)

// NOTES FOR GEMINI IMPLEMENTATION:
// 1. Use character_database.json for character data and abilities
// 2. Integrate with existing Discord panel system in discord_integration.js
// 3. Use ana_commentary_master.json for voiceline triggers
// 4. Follow existing code style and patterns
// 5. Maintain compatibility with current UI/UX design
// 6. Test with 6 characters from current roster for initial implementation 