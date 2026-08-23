/**
 * Discord Integration and Panel Management for OHR
 * Handles Discord user panels, authentication, and game state interactions
 */

// ################################################################################
// # Discord Panels & Interaction Layer (Client-side)
// #
// # Sections:
// # 1) Constructor & Initialization
// # 2) Panel Initialization & Events
// # 3) Auth (mock) & Sign-in/out
// # 4) Panel Button Actions (CHOOSE/CHEER)
// # 5) Character Selection Integration
// # 6) UI Helpers (banner, exit, states)
// ################################################################################

class DiscordIntegration {
    constructor() {
        this.panels = {};
        this.currentGameState = 'intermission'; // intermission, racing, results
        this.isInitialized = false;
        this.audioSystem = null;
        this.characterSelection = null;
    this.localUser = null; // persisted mock auth
    this.abilityCooldownMsByPanel = {}; // panelId -> ms
        
        this.init();
    }

    async init() {
        try {
            // Initialize panel system
            this.initializePanels();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Try to restore Discord session from backend (if available)
            await this.tryRestoreDiscordSession();

      // Restore local user if present
      try {
        const saved = localStorage.getItem('ohr_local_user');
        if (saved) this.localUser = JSON.parse(saved);
      } catch {}

            this.isInitialized = true;
            console.log('Discord Integration system initialized');
        } catch (error) {
            console.error('Failed to initialize Discord Integration:', error);
        }
    }



    initializePanels() {
        // Initialize all 6 panels
        for (let i = 1; i <= 6; i++) {
            this.panels[i] = {
                id: i,
                isEmpty: true,
                user: null,
                character: null,
                element: document.getElementById(`discord-panel-${i}`),
                bannerEl: null,
                exitBtn: null,
                isOwner: false,
                locked: false,
            };
            const el = this.panels[i].element;
            if (el) {
                this.panels[i].bannerEl = el.querySelector('.panel-banner img');
                this.panels[i].exitBtn = el.querySelector('.panel-exit-btn');
                if (this.panels[i].exitBtn) {
                    this.panels[i].exitBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.leavePanel(i);
                    });
                    // Store reference for enabling/disabling
                    this.panels[i].exitBtnOriginalDisplay = this.panels[i].exitBtn.style.display || '';
                }
                // Ensure tooltip attribute exists for CSS tooltips
                if (!el.getAttribute('data-tooltip')) el.setAttribute('data-tooltip', '');
            }
        }
    }

    setupEventListeners() {
        // Set up click handlers for all panels
        for (let i = 1; i <= 6; i++) {
            const panel = document.getElementById(`discord-panel-${i}`);
            if (panel) {
                panel.addEventListener('click', () => this.handlePanelClick(i));
            }
        }

        // Listen for game state changes
        document.addEventListener('gameStateChanged', (event) => {
            this.updateGameState(event.detail.newState);
        });
    }

    handlePanelClick(panelId) {
        const panel = this.panels[panelId];
        if (!panel) return;
        const el = panel.element;
        const alreadyOwned = this.getOwnedPanelId();
        const inviteOk = panel.isEmpty && alreadyOwned && alreadyOwned !== panelId && this.isBetweenRaces();
        if (el && el.classList.contains('disabled-claim') && !inviteOk) return;

        if (panel.isEmpty) {
            if (alreadyOwned && alreadyOwned !== panelId) {
                if (this.isBetweenRaces()) {
                    this.openInvitePrompt();
                    return;
                }
                if (el) {
                    el.classList.add('disabled-claim');
                    el.setAttribute('data-tooltip', `You already claimed Slot ${alreadyOwned}`);
                }
                return;
            }
            // If we already have a restored Discord user, bind immediately
            if (this.localUser && this.localUser.id) {
                this.signUserIntoPanel(panelId, this.localUser);
                // Attempt backend join for preferred slot
                if (window.backendClient && window.backendClient.ensureSession) {
                    window.backendClient.ensureSession()
                        .then(() => window.backendClient.join(this.localUser.id, this.localUser.username, panelId, this.localUser.avatar || null))
                        .catch(() => {});
                }
                return;
            }
            this.handleDiscordAuth(panelId);
        } else {
            // Filled panel - handle button action based on game state or lock state
            this.handlePanelAction(panelId);
        }
    }

    async handleDiscordAuth(panelId) {
        const isDev = !!(window.BACKEND_CONFIG && window.BACKEND_CONFIG.isDevelopment);

        // Localhost: mint / reuse Dev Guest instead of Discord OAuth
        if (isDev && window.backendClient && window.backendClient.devGuestLogin) {
            this.showPanelLoading(panelId, 'Signing in as Dev Guest...');
            try {
                let user = this.localUser;
                if (!user || !user.id) {
                    const guest = await window.backendClient.devGuestLogin();
                    if (guest && guest.discordId) {
                        user = { id: guest.discordId, username: guest.username || 'Dev Guest', avatar: guest.avatar || null };
                        this.localUser = user;
                        try { localStorage.setItem('ohr_local_user', JSON.stringify(user)); } catch {}
                    }
                }
                if (user && user.id) {
                    this.signUserIntoPanel(panelId, user);
                    if (window.backendClient.ensureSession) {
                        try {
                            await window.backendClient.ensureSession();
                            await window.backendClient.join(user.id, user.username, panelId, user.avatar || null);
                        } catch {}
                    }
                    return;
                }
            } catch (err) {
                console.error('Dev guest auth error:', err);
                this.showPanelError(panelId, 'Dev guest login failed');
                return;
            }
        }

        // Try real OAuth flow first
        if (window.BACKEND_CONFIG && window.backendClient && window.backendClient.baseUrl && !String(window.backendClient.baseUrl).includes('REPLACE_WITH')) {
            const ret = encodeURIComponent(window.location.href);
            const url = `${window.backendClient.baseUrl}/auth/discord/login?slot=${encodeURIComponent(panelId)}&return=${ret}`;
            window.location.href = url;
            return;
        }
        // Fallback to mock auth in offline mode
        this.showPanelLoading(panelId, 'Connecting to Discord...');
        try {
            const authResult = await this.mockDiscordAuth(panelId);
            if (authResult.success) {
                this.signUserIntoPanel(panelId, authResult.user);
            } else {
                this.showPanelError(panelId, authResult.error || 'Discord authentication failed');
            }
        } catch (err) {
            console.error('Discord auth error:', err);
            this.showPanelError(panelId, 'Connection error');
        }
        if (this.audioSystem && this.audioSystem.playButtonSound) {
            this.audioSystem.playButtonSound();
        }
    }

    async tryRestoreDiscordSession() {
        // Only in backend-connected mode
        if (!(window.backendClient && window.backendClient.baseUrl && !String(window.backendClient.baseUrl).includes('REPLACE_WITH'))) return;
        try {
            let u = null;
            if (window.backendClient.authMe) {
                u = await window.backendClient.authMe(3000);
            } else {
                const r = await fetch(`${window.backendClient.baseUrl}/auth/me`, { credentials: 'include' });
                if (!r.ok) return;
                const data = await r.json().catch(() => null);
                u = data && data.user;
            }
            if (u && u.discordId) {
                const user = { id: u.discordId, username: u.username || 'Discord User', avatar: u.avatar || null };
                this.localUser = user;
                try { localStorage.setItem('ohr_local_user', JSON.stringify(user)); } catch {}
            }
        } catch {}
    }

    async mockDiscordAuth(panelId) {
        // Mock implementation - replace with real Discord OAuth
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if user is already signed in to another panel
        // In real implementation, this would check against Discord ID
        const existingUser = this.findUserInPanels(`Player${panelId}`);
        if (existingUser) {
            return {
                success: false,
                error: 'Already signed in to another panel'
            };
        }
        
    const existing = this.localUser;
    const mockUser = existing || {
      id: `discord_${Date.now()}_${panelId}`,
            username: `Player${panelId}`,
            avatar: `https://via.placeholder.com/40x40/ff7f22/ffffff?text=P${panelId}`,
            discriminator: Math.floor(Math.random() * 9999).toString().padStart(4, '0')
        };

    // Persist for reconnect/rebind
    try { localStorage.setItem('ohr_local_user', JSON.stringify(mockUser)); this.localUser = mockUser; } catch {}

    // Attempt backend join for preferred slot
    if (window.backendClient && window.backendClient.ensureSession) {
      try {
        await window.backendClient.ensureSession();
        const res = await window.backendClient.join(mockUser.id, mockUser.username, panelId);
        if (res?.slot && res.slot !== panelId) {
          // server assigned a different slot; reflect UI accordingly
          panelId = res.slot;
        }
      } catch {}
    }

    return {
            success: true,
            user: mockUser
        };
    }

    findUserInPanels(username) {
        for (let i = 1; i <= 6; i++) {
            const panel = this.panels[i];
            if (!panel.isEmpty && panel.user && panel.user.username === username) {
                return panel.user;
            }
        }
        return null;
    }

    // TODO: Real Discord OAuth method
    async initiateDiscordOAuth(panelId) {
        // This would be implemented when you have a backend server
        // Example implementation:
        /*
        const clientId = 'YOUR_DISCORD_CLIENT_ID';
        const redirectUri = encodeURIComponent('YOUR_BACKEND_URL/auth/discord/callback');
        const scopes = 'identify';
        
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${panelId}`;
        
        // Open popup or redirect
        const authWindow = window.open(authUrl, 'discordAuth', 'width=500,height=600');
        
        return new Promise((resolve, reject) => {
            const checkClosed = setInterval(() => {
                if (authWindow.closed) {
                    clearInterval(checkClosed);
                    // Check if auth was successful via your backend
                    // resolve with user data or reject
                }
            }, 1000);
        });
        */
        throw new Error('Real Discord OAuth not implemented - requires backend server');
    }

    showPanelLoading(panelId, message) {
        const panel = this.panels[panelId];
        const panelElement = panel.element;
        
        if (panelElement) {
            panelElement.querySelector('.panel-content').innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    <div style="font-size: 12px; color: #404d70;">${message}</div>
                    <div style="width: 20px; height: 20px; border: 2px solid #ff7f22; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                </div>
            `;
        }
    }

    showPanelError(panelId, message) {
        const panel = this.panels[panelId];
        const panelElement = panel.element;
        
        if (panelElement) {
            panelElement.querySelector('.panel-content').innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="font-size: 11px; color: #e74c3c; text-align: center;">${message}</div>
                    <button onclick="window.discordIntegration.handleDiscordAuth(${panelId})" 
                            style="background: #ff7f22; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
        
        // Reset to empty after 3 seconds
        setTimeout(() => {
            if (panel.isEmpty) {
                this.updatePanelDisplay(panelId);
            }
        }, 3000);
    }

    signUserIntoPanel(panelId, user) {
        const panel = this.panels[panelId];
        if (!panel) return;

    panel.isEmpty = false;
        panel.user = user;
    panel.isOwner = true;
    panel.locked = false;
        
        // Update panel visual state
        this.updatePanelDisplay(panelId);
        
        console.log(`User ${user.username} signed into panel ${panelId}`);
    }

    updatePanelDisplay(panelId) {
        const panel = this.panels[panelId];
        const panelElement = panel.element;
        
        if (!panel || !panelElement) return;

        if (panel.isEmpty) {
            // Show plus sign
            panelElement.className = 'discord-panel empty';
            panelElement.querySelector('.panel-content').innerHTML = `
                <div class="plus-icon">+</div>
            `;
            panelElement.classList.remove('owner', 'has-banner');
        } else {
            // Show user info and appropriate button
            panelElement.className = 'discord-panel filled';
            if (panel.isOwner) panelElement.classList.add('owner');
            
            const buttonHTML = this.getButtonHTML(panel);
            const avatarSrc = panel.user.avatar || this.getAiAvatarForSlot(panelId) || `https://via.placeholder.com/40x40/ff7f22/ffffff?text=${(panel.user.username||'A').charAt(0)}`;
            
            panelElement.querySelector('.panel-content').innerHTML = `
                <div class="user-profile">
                    <img src="${avatarSrc}" alt="${panel.user.username}" class="user-avatar">
                    <div class="user-name">${panel.user.username}</div>
                </div>
                ${buttonHTML}
            `;

            // Set up button event listener
            const button = panelElement.querySelector('.panel-action-btn');
            if (button) {
                // Disable for non-owner in any phase
                if (!panel.isOwner) {
                    button.disabled = true;
                    button.classList.add('disabled');
                    if (this.currentGameState === 'intermission') {
                        button.textContent = 'CHOOSE';
                    } else if (this.currentGameState === 'racing') {
                        button.textContent = 'WAITING';
                        // Provide clearer tooltip for mid-race state on non-owners
                        panelElement.classList.add('disabled-claim');
                        panelElement.setAttribute('data-tooltip', 'Race in progress. Claiming and actions are disabled until intermission.');
                        button.setAttribute('data-tooltip', 'Race in progress. Actions are disabled until intermission.');
                    } else if (this.currentGameState === 'results') {
                        button.textContent = 'RESULTS';
                    }
                }
                button.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent panel click
                    this.handleButtonAction(panelId);
                });
            }

            // Update banner image if character selected
            const bannerImg = panel.bannerEl;
            if (bannerImg && panel.character) {
                const charId = panel.character.id;
                if (window.OHRAssets && window.OHRAssets.applyRosterSrc) {
                    window.OHRAssets.applyRosterSrc(bannerImg, charId, panel.character.assets);
                } else {
                    const canonId = this.canonicalizeCharacterId(charId);
                    bannerImg.src = panel.character?.assets?.thumbnail || `../images/current_roster/${canonId}_roster.png`;
                }
                bannerImg.alt = panel.character.display_name || panel.character.id;
                panelElement.classList.add('has-banner');
            }
        }
    }

    // Find current owned panel id (simple heuristic for now)
    getOwnedPanelId() {
        for (let i = 1; i <= 6; i++) {
            if (this.panels[i]?.isOwner) return i;
        }
        return null;
    }

    isBetweenRaces() {
        const phase = this.currentGameState;
        return phase === 'intermission' || phase === 'results';
    }

    openInvitePrompt() {
        const overlay = document.getElementById('invite-prompt');
        const urlInput = document.getElementById('invite-prompt-url');
        const copyBtn = document.getElementById('invite-prompt-copy');
        const closeBtn = document.getElementById('invite-prompt-close');
        if (!overlay || !window.backendClient || !window.backendClient.getSessionInviteUrl) return;
        const url = window.backendClient.getSessionInviteUrl();
        if (urlInput) urlInput.value = url;
        overlay.hidden = false;
        overlay.classList.remove('hidden');
        const close = () => {
            overlay.hidden = true;
            overlay.classList.add('hidden');
        };
        if (copyBtn && !copyBtn.dataset.inviteWired) {
            copyBtn.dataset.inviteWired = '1';
            copyBtn.addEventListener('click', async () => {
                const result = await window.backendClient.copySessionInvite();
                const prev = copyBtn.textContent;
                copyBtn.textContent = result.ok ? 'COPIED' : 'COPY SHOWN';
                if (urlInput && result.url) urlInput.value = result.url;
                setTimeout(() => { copyBtn.textContent = prev; }, 1400);
            });
        }
        if (closeBtn && !closeBtn.dataset.inviteWired) {
            closeBtn.dataset.inviteWired = '1';
            closeBtn.addEventListener('click', close);
        }
        if (!overlay.dataset.inviteWired) {
            overlay.dataset.inviteWired = '1';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
        }
    }

    getButtonHTML(panel) {
        if (this.currentGameState === 'intermission') {
            if (panel.isOwner) {
                if (panel.character && !panel.locked) {
                    return '<button class="panel-action-btn choose" data-phase="intermission" data-intent="lock">LOCK IN</button>';
                }
                if (panel.locked) {
                    // Check if timer > 15 seconds - allow changing
                    const timer = window.ohrGameEngine?.intermissionTimer || 180;
                    if (timer > 15) {
                        return '<button class="panel-action-btn choose" data-phase="intermission" data-intent="change">CHANGE</button>';
                    }
                    return '<button class="panel-action-btn disabled" disabled data-phase="intermission">LOCKED</button>';
                }
                return '<button class="panel-action-btn choose" data-phase="intermission" data-intent="choose">CHOOSE</button>';
            }
            return '<button class="panel-action-btn disabled" disabled data-phase="intermission">CHOOSE</button>';
        }
        if (this.currentGameState === 'racing') {
            return '<button class="panel-action-btn cheer" data-phase="racing">CHEER!</button>';
        }
        if (this.currentGameState === 'results') {
            return '<button class="panel-action-btn" data-phase="results" data-intent="results">RESULTS</button>';
        }
        return '<button class="panel-action-btn disabled" disabled data-phase="unknown">WAIT</button>';
    }

    handlePanelAction(panelId) {
        const panel = this.panels[panelId];
        if (!panel || panel.isEmpty) return;

        if (this.currentGameState === 'intermission') {
            // Check button intent
            const button = panel.element?.querySelector('.panel-action-btn');
            const intent = button?.getAttribute('data-intent');
            
            // If locked and intent is "change", allow changing (if timer > 15)
            if (panel.locked && intent === 'change') {
                const timer = window.ohrGameEngine?.intermissionTimer || 180;
                if (timer > 15) {
                    // Unlock and open selection
                    panel.locked = false;
                    this.updatePanelDisplay(panelId);
                    this.openCharacterSelection(panelId);
                }
                return;
            }
            
            // If owner has selected a character and not locked, treat as lock-in
            if (panel.isOwner && panel.character && !panel.locked) {
                this.lockInPanel(panelId);
                return;
            }
            // Otherwise open selection
            this.openCharacterSelection(panelId);
            return;
        }
        if (this.currentGameState === 'racing') {
            this.handleCheer(panelId);
            return;
        }
        console.log(`No action available in ${this.currentGameState} state`);
    }

    handleButtonAction(panelId) {
        // If results phase and button intent is results, open results display
        const btn = this.panels[panelId]?.element?.querySelector('.panel-action-btn');
        if (btn && this.currentGameState === 'results') {
            this.openResultsPanel();
            return;
        }
        this.handlePanelAction(panelId);
    }

    openCharacterSelection(panelId) {
        if (this.characterSelection && this.characterSelection.openSelection) {
            try {
                const rs = document.getElementById('results-session-modal');
                if (rs) rs.classList.add('hidden');
                const raceModal = document.getElementById('scoreboard-modal');
                if (raceModal) raceModal.classList.add('hidden');
            } catch {}
            this.characterSelection.openSelection(panelId);
        } else {
            console.warn('Character selection system not available');
        }
        // When selection overlay opens, the panel is in CHOOSE state. Lock-in happens explicitly via overlay.
    }

    async lockInPanel(panelId) {
        const panel = this.panels[panelId];
        if (!panel || !panel.isOwner || !panel.character || panel.locked) return;
        if (window.backendClient && panel.user?.id) {
            try {
                const res = await window.backendClient.lockIn(panel.user.id);
                if (res?.status === 'success') {
                    panel.locked = true;
                    if (this.audioSystem && this.audioSystem.playLockInSound) {
                        this.audioSystem.playLockInSound();
                    }
                    this.updatePanelDisplay(panelId);
                }
            } catch (e) { console.warn('Lock-in failed', e); }
        }
    }

    handleCheer(panelId) {
        const panel = this.panels[panelId];
        if (!panel || panel.isEmpty) return;
        if (!panel.isOwner) return; // enforce cheer-only-own on client side
        
        // Check if button is already disabled (on cooldown)
        const button = panel.element?.querySelector('.panel-action-btn');
        if (button && button.disabled) {
            console.log('Cheer button is on cooldown');
            return; // Prevent multiple clicks
        }
        
        // Check if panel has active cooldown timer
        if (panel._cheerCooldownActive) {
            console.log('Cheer is still on cooldown');
            return;
        }
        
        // Mark cooldown as active immediately to prevent race conditions
        panel._cheerCooldownActive = true;
        
        // Implement cheer functionality via backend
        this.executeCheer(panelId);
        if (window.backendClient && panel.user && panel.character) {
            try { 
                const result = window.backendClient.cheer(panel.user.id, panel.character.display_name || panel.character.id);
                // If server returns error (e.g., still on cooldown), reset local cooldown flag
                if (result && result.status === 'error') {
                    panel._cheerCooldownActive = false;
                    console.warn('Server rejected cheer:', result.message);
                    return;
                }
            } catch (e) {
                panel._cheerCooldownActive = false;
                console.warn('Cheer failed:', e);
                return;
            }
        }
        
        // Start cooldown (this will disable button)
        const dur = this.abilityCooldownMsByPanel[panelId];
        this.startCheerCooldown(panelId, typeof dur === 'number' ? dur : undefined);
        
        console.log(`${panel.user.username} cheered!`);
    }

    executeCheer(panelId) {
        // Add visual effect to panel
        const panelElement = this.panels[panelId].element;
        if (panelElement) {
            panelElement.classList.add('cheering');
            setTimeout(() => {
                panelElement.classList.remove('cheering');
            }, 1000);
        }

        // Play cheer sound
        if (this.audioSystem && this.audioSystem.playCheerSound) {
            this.audioSystem.playCheerSound();
        }

        // Trigger cheer effect in game engine
        if (window.gameEngine && window.gameEngine.handleCheer) {
            window.gameEngine.handleCheer(panelId);
        }
    }

    startCheerCooldown(panelId, durationMs) {
        const panel = this.panels[panelId];
        const button = panel.element?.querySelector('.panel-action-btn');
        
        if (!button) {
            // Clear cooldown flag if button not found
            panel._cheerCooldownActive = false;
            return;
        }

        // Duration can be per-ability from server; if not provided, default to 12s (per character ability cooldown)
        const duration = typeof durationMs === 'number' ? durationMs : 12000;
        button.disabled = true;
        button.textContent = 'COOLDOWN';
        
        // Store interval ID to allow clearing if needed
        let timeLeft = Math.ceil(duration / 1000);
        button.textContent = `WAIT ${timeLeft}s`;
        
        const cooldownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                button.textContent = `WAIT ${timeLeft}s`;
            } else {
                clearInterval(cooldownInterval);
                button.disabled = false;
                button.textContent = 'CHEER!';
                // Clear cooldown flag
                panel._cheerCooldownActive = false;
            }
        }, 1000);
        
        // Store interval ID in panel for potential cleanup
        panel._cheerCooldownInterval = cooldownInterval;
    }

    updateGameState(newState) {
        if (this.currentGameState === newState) return;
        
        const oldState = this.currentGameState;
        this.currentGameState = newState;
        
        // Hide intermission sign when leaving intermission phase
        if (oldState === 'intermission' && (newState === 'starting_race' || newState === 'racing')) {
            if (window.ohrGameEngine && window.ohrGameEngine.hideIntermissionElements) {
                window.ohrGameEngine.hideIntermissionElements();
            }
        }
        
        // Update all panel buttons based on new state
        this.updateAllPanelButtons();

        // If leaving results, close any open results/session modal
        if (newState !== 'results') {
            try {
                const rs = document.getElementById('results-session-modal');
                if (rs) { rs.classList.add('anim-fade-out'); setTimeout(() => rs.classList.add('hidden'), 280); }
            } catch {}
        }

        // Apply waiting class for spectators / mid-race join when not in intermission
        const waiting = newState !== 'intermission';
        const isRaceActive = newState === 'racing' || newState === 'starting_race';
        
        for (let i = 1; i <= 6; i++) {
            const el = this.panels[i]?.element;
            const panel = this.panels[i];
            if (!el) continue;
            
            // Disable/hide exit button during race
            if (panel.exitBtn) {
                if (isRaceActive && panel.isOwner) {
                    // Hide exit button during race - user must stay until race ends
                    panel.exitBtn.style.display = 'none';
                    panel.exitBtn.disabled = true;
                } else {
                    // Restore exit button when race ends
                    panel.exitBtn.style.display = panel.exitBtnOriginalDisplay || '';
                    panel.exitBtn.disabled = false;
                }
            }
            
            // Save avatar when race starts, restore when race ends
            if (newState === 'racing' && panel.user?.avatar && !panel.savedAvatar) {
                // Save avatar at race start
                panel.savedAvatar = panel.user.avatar;
            } else if (newState === 'intermission' && panel.savedAvatar && !panel.user?.avatar) {
                // Restore saved avatar when returning to intermission
                if (panel.user) {
                    panel.user.avatar = panel.savedAvatar;
                }
            }
            
            if (waiting && panel.isEmpty) {
                el.classList.add('waiting');
                el.classList.add('disabled-claim');
                el.setAttribute('data-tooltip', 'Race in progress. You can claim a panel and choose a character during intermission.');
            } else {
                el.classList.remove('waiting');
                // Re-enable claims at intermission if user has no owned slot
                const owned = this.getOwnedPanelId();
                if (!owned) {
                    el.classList.remove('disabled-claim');
                    el.setAttribute('data-tooltip', '');
                }
            }
        }
        // Spectator mode badge
        const owned = this.getOwnedPanelId();
        const isSpectator = !owned && newState !== 'intermission';
        this.updateSpectatorBadge(isSpectator);
        
        console.log(`Game state changed from ${oldState} to ${newState}`);
    }

    updateAllPanelButtons() {
        for (let i = 1; i <= 6; i++) {
      if (!this.panels[i].isEmpty) {
        this.updatePanelDisplay(i);
      }
        }
    }

    // Method to set character for a panel (called from character selection)
    setCharacterForPanel(panelId, character) {
        const panel = this.panels[panelId];
        if (!panel || panel.isEmpty) return;

        panel.character = character;

        // Send selection to backend only; lock-in is explicit in intermission via overlay button
        if (window.backendClient && panel.user?.id && character?.id) {
          try {
            window.backendClient.selectCharacter(panel.user.id, character.id);
          } catch {}
        }
        
        // Do NOT override user avatar with character art; keep Discord avatar

        // Update banner image
        const bannerImg = panel.bannerEl;
        if (bannerImg) {
            if (window.OHRAssets && window.OHRAssets.applyRosterSrc) {
                window.OHRAssets.applyRosterSrc(bannerImg, character?.id, character?.assets);
            } else {
                const canonId = this.canonicalizeCharacterId(character?.id);
                bannerImg.src = character?.assets?.thumbnail || `../images/current_roster/${canonId}_roster.png`;
            }
            bannerImg.alt = character.display_name;
            panel.element.classList.add('has-banner');
            // Clear blur if owner is locked; keep greyed in waiting
            if (panel.locked && this.currentGameState === 'intermission') {
                panel.element.classList.remove('waiting');
            }
        }

        console.log(`Character ${character.display_name} assigned to panel ${panelId}`);
    }

    // Get current panel states
    getPanelStates() {
        return Object.values(this.panels).map(panel => ({
            id: panel.id,
            isEmpty: panel.isEmpty,
            user: panel.user,
            character: panel.character
        }));
    }

    // Find a panel by racer display name (server events use display names)
    findPanelIdByRacerName(racerName) {
        if (!racerName) return null;
        const norm = (s) => (s || '').toString().toLowerCase().replace(/[\s\.:]/g, '');
        const target = norm(racerName);
        for (let i = 1; i <= 6; i++) {
            const panel = this.panels[i];
            if (!panel || !panel.character) continue;
            const dn = norm(panel.character.display_name || panel.character.id);
            if (dn === target) return i;
        }
        return null;
    }

    // Method to clear a panel
    clearPanel(panelId) {
        const panel = this.panels[panelId];
        if (!panel) return;

        panel.isEmpty = true;
        panel.user = null;
        panel.character = null;
        panel.isOwner = false;
        panel.locked = false;
        
        this.updatePanelDisplay(panelId);
    }

    // Owner-initiated leave
    leavePanel(panelId) {
        const panel = this.panels[panelId];
        if (!panel || !panel.isOwner) return;
        
        // Prevent leaving during race - user must stay until race ends
        if (this.currentGameState === 'racing' || this.currentGameState === 'starting_race') {
            console.log('Cannot leave panel during race');
            return;
        }
        
        // Save avatar before clearing (in case user wants to return)
        if (panel.user?.avatar) {
            panel.savedAvatar = panel.user.avatar;
        }
        
        // Local UI reset
        this.clearPanel(panelId);
        // Optionally call backend leave when wired with real users
        if (window.backendClient && panel.user?.id) {
            // Only call backend leave if not during race
            if (this.currentGameState === 'intermission' || this.currentGameState === 'results') {
                try { window.backendClient.leave(panel.user.id); } catch {}
            }
        }
    }

    // Visual effects on banner based on events
    applyBannerVfx(panelId, type, durationMs = 1200) {
        const panel = this.panels[panelId];
        if (!panel || !panel.bannerEl) return;
        const wrap = panel.element.querySelector('.panel-banner');
        if (!wrap) return;
        const cls = type === 'buff' ? 'vfx-buff' : type === 'debuff' ? 'vfx-debuff' : 'vfx-ability';
        if (wrap.classList.contains(cls)) return;
        wrap.classList.add(cls);
        setTimeout(() => wrap.classList.remove(cls), durationMs);

        // Mirror effect on avatar ring
        const avatar = panel.element.querySelector('.user-avatar');
        if (avatar) {
            const acls = type === 'buff' ? 'avatar-buff' : 'avatar-debuff';
            avatar.classList.add(acls);
            setTimeout(() => avatar.classList.remove(acls), durationMs);
        }

    }

    // Apply server-side players mapping to panels; supports auto-rebind
    applyServerPlayers(playersMap) {
        if (!playersMap || typeof playersMap !== 'object') return;
        const localId = this.localUser?.id || null;
        const mapKeys = Object.keys(playersMap);
        // Ignore empty player snapshots while we still show a local claim.
        // Duplicate/orphaned WS connections (or a ghost SessionDO) can broadcast
        // players:{} interleaved with the real map and thrash panel innerHTML.
        if (mapKeys.length === 0 && localId) {
            for (let i = 1; i <= 6; i++) {
                if (this.panels[i]?.user?.id === localId) return;
            }
        }
        // Determine if local user actually owns a slot in this session
        let ownedSlotId = null;
        if (localId) {
          for (let i = 1; i <= 6; i++) {
            const p = playersMap[i];
            if (p && p.userId === localId) { ownedSlotId = i; break; }
          }
        }
        const avatarEq = (a, b) => (a || '') === (b || '');
        for (let i = 1; i <= 6; i++) {
            const p = playersMap[i];
            const panel = this.panels[i];
            if (!panel) continue;
            const prevUser = panel.user || {};
            const prevCharacterId = panel.character?.id ?? null;
            const prevUserId = prevUser?.id ?? null;
            const prevUsername = prevUser?.username ?? null;
            const prevAvatar = prevUser?.avatar ?? null;
            const prevLocked = !!panel.locked;
            const prevIsEmpty = !!panel.isEmpty;
            const prevIsOwner = !!panel.isOwner;
            if (!p) {
                // No server player in this slot
                if (this.currentGameState === 'racing') {
                    // During racing, fill UI with anonymous AI placeholder
                    const nextUser = { id: null, username: 'AI', avatar: this.getAiAvatarForSlot(i) };
                    const nextIsEmpty = false;
                    const nextIsOwner = false;
                    const nextLocked = true;
                    const nextCharacterId = prevCharacterId;

                    panel.isEmpty = nextIsEmpty;
                    panel.user = nextUser;
                    panel.character = panel.character && panel.character.serverAssigned ? panel.character : panel.character; // preserve banner if any
                    panel.isOwner = nextIsOwner;
                    panel.locked = nextLocked;

                    const shouldRender =
                      prevIsEmpty !== nextIsEmpty ||
                      prevIsOwner !== nextIsOwner ||
                      prevLocked !== nextLocked ||
                      prevUserId !== nextUser.id ||
                      prevUsername !== nextUser.username ||
                      !avatarEq(prevAvatar, nextUser.avatar) ||
                      prevCharacterId !== nextCharacterId;

                    if (shouldRender) this.updatePanelDisplay(i);
                    const el = panel.element;
                    if (el) {
                        if (shouldRender) {
                          el.classList.add('disabled-claim');
                          el.setAttribute('data-tooltip', 'Race in progress. This slot is controlled by AI.');
                        }
                    }
                } else {
                    // Intermission or results → keep empty
                    const nextIsEmpty = true;
                    const nextIsOwner = false;
                    const nextLocked = false;
                    const nextCharacterId = (panel.character && panel.character.serverAssigned) ? null : prevCharacterId;

                    panel.isEmpty = nextIsEmpty;
                    panel.user = null;
                    panel.character = panel.character && panel.character.serverAssigned ? null : panel.character;
                    panel.isOwner = nextIsOwner;
                    panel.locked = nextLocked;

                    const shouldRender =
                      prevIsEmpty !== nextIsEmpty ||
                      prevIsOwner !== nextIsOwner ||
                      prevLocked !== nextLocked ||
                      prevUserId !== null ||
                      prevCharacterId !== nextCharacterId;

                    if (shouldRender) this.updatePanelDisplay(i);
                    const el = panel.element;
                    if (el) {
                        if (shouldRender) {
                          if (ownedSlotId) {
                              el.classList.add('disabled-claim');
                              el.setAttribute('data-tooltip', `You already claimed Slot ${ownedSlotId}`);
                          } else {
                              el.classList.remove('disabled-claim');
                              el.setAttribute('data-tooltip', '');
                          }
                        }
                    }
                }
                continue;
            }
            const nextIsEmpty = false;
            const nextUser = p.userId
              ? { id: p.userId, username: p.username, avatar: p.avatar || null }
              : { id: null, username: p.username || 'AI', avatar: this.getAiAvatarForSlot(i) };
            const nextIsOwner = !!(localId && p.userId === localId);
            const nextLocked = !!p.locked;
            const nextCharacterId = p.characterId ?? null;
            panel.isEmpty = nextIsEmpty;
            panel.user = nextUser;
            panel.isOwner = nextIsOwner;
            panel.locked = nextLocked;
            // Map character banner if selected; clear when server has no character
            const characterChanged = prevCharacterId !== nextCharacterId;
            if (p.characterId) {
                panel.character = panel.character || {};
                panel.character.id = p.characterId;
                panel.character.display_name = p.characterId; // will be improved by selection_update
                panel.character.serverAssigned = true;
                if (characterChanged) {
                    const bannerImg = panel.bannerEl;
                    if (bannerImg) {
                        if (window.OHRAssets && window.OHRAssets.applyRosterSrc) {
                            window.OHRAssets.applyRosterSrc(bannerImg, p.characterId, panel.character?.assets);
                        } else {
                            const canonId = this.canonicalizeCharacterId(p.characterId);
                            bannerImg.src = `../images/current_roster/${canonId}_roster.png`;
                        }
                        bannerImg.alt = p.characterId;
                        panel.element.classList.add('has-banner');
                    }
                }
            } else if (panel.character) {
                panel.character = null;
                const bannerImg = panel.bannerEl;
                if (bannerImg) {
                    bannerImg.removeAttribute('src');
                    bannerImg.alt = '';
                }
                panel.element?.classList.remove('has-banner');
            }
            if (typeof p.abilityCooldownSec === 'number') {
                this.abilityCooldownMsByPanel[i] = Math.max(0, Math.floor(p.abilityCooldownSec * 1000));
            }
            const shouldRender =
              prevIsEmpty !== nextIsEmpty ||
              prevIsOwner !== nextIsOwner ||
              prevLocked !== nextLocked ||
              prevUserId !== nextUser.id ||
              prevUsername !== nextUser.username ||
              !avatarEq(prevAvatar, nextUser.avatar) ||
              prevCharacterId !== nextCharacterId;
            if (shouldRender) this.updatePanelDisplay(i);
        }
        const ownedAfter = this.getOwnedPanelId();
        const isSpectator = !ownedAfter && this.currentGameState !== 'intermission';
        if (this._lastSpectatorShown !== isSpectator) {
            this.updateSpectatorBadge(isSpectator);
            this._lastSpectatorShown = isSpectator;
        }
    }

    // Selection update (slot, characterId) from server
    applySelectionUpdate(slot, characterId) {
        const panel = this.panels[slot];
        if (!panel) return;
        panel.character = panel.character || {};
        panel.character.id = characterId;
        panel.character.display_name = characterId;
        const bannerImg = panel.bannerEl;
        if (bannerImg) {
            if (window.OHRAssets && window.OHRAssets.applyRosterSrc) {
                window.OHRAssets.applyRosterSrc(bannerImg, characterId, panel.character?.assets);
            } else {
                const canonId = this.canonicalizeCharacterId(characterId);
                bannerImg.src = `../images/current_roster/${canonId}_roster.png`;
            }
            bannerImg.alt = characterId;
            panel.element.classList.add('has-banner');
        }
        this.updatePanelDisplay(slot);
    }

    // Lock-in update (slot) from server
    applyLockIn(slot) {
        const panel = this.panels[slot];
        if (!panel) return;
        panel.locked = true;
        this.updatePanelDisplay(slot);
    }

    // Floating spectator badge
    updateSpectatorBadge(show) {
        let badge = document.getElementById('spectator-badge');
        if (show) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'spectator-badge';
                badge.className = 'spectator-badge';
                badge.textContent = 'SPECTATOR';
                document.body.appendChild(badge);
            }
        } else if (badge) {
            badge.parentNode && badge.parentNode.removeChild(badge);
        }
    }

    // Results overlay showing session points and per-place table
    openResultsPanel() {
        const state = window._lastServerState || {};
        const pointsMap = state.player_points || {};
        const table = state.points_table || { 1: 50000, 2: 23000, 3: 16000, 4: 3250, 5: 1110, 6: 660 };
        const modalId = 'results-session-modal';
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                  <div class="modal-header">
                    <h2>Session Points</h2>
                    <button class="close-modal">&times;</button>
                  </div>
                  <div class="modal-body">
                    <div id="points-table-wrap"></div>
                    <div style="margin-top:16px">
                      <h3>Points per Placement</h3>
                      <table class="scoreboard-table" id="placement-points">
                        <thead><tr><th>Place</th><th>Points</th></tr></thead>
                        <tbody></tbody>
                      </table>
                    </div>
                  </div>
                </div>`;
            document.body.appendChild(modal);
            const closeBtn = modal.querySelector('.close-modal');
            if (closeBtn) closeBtn.addEventListener('click', () => { modal.classList.add('anim-fade-out'); setTimeout(() => modal.classList.add('hidden'), 280); });
        }
        const body = modal.querySelector('#points-table-wrap');
        if (body) {
            const entries = Object.entries(pointsMap).map(([uid, v]) => ({ uid, username: v.username || uid, points: v.points || 0 }));
            entries.sort((a, b) => b.points - a.points);
            const rows = entries.map((e, i) => `<tr><td class="position-cell">${i + 1}</td><td>${e.username}</td><td>${e.points.toLocaleString()}</td></tr>`).join('');
            body.innerHTML = `<table class="scoreboard-table"><thead><tr><th>Rank</th><th>Player</th><th>Points</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No points yet</td></tr>'}</tbody></table>`;
        }
        const tbody = modal.querySelector('#placement-points tbody');
        if (tbody) {
            tbody.innerHTML = [1,2,3,4,5,6].map(p => `<tr><td>${p}</td><td>${(table[p]||0).toLocaleString()}</td></tr>`).join('');
        }
        modal.classList.remove('hidden');
        modal.classList.remove('anim-fade-out');
        modal.classList.add('anim-fade-in');
        if (this.resultsAutoCloseTimer) { try { clearTimeout(this.resultsAutoCloseTimer); } catch {} }
        this.resultsAutoCloseTimer = setTimeout(() => {
            try { modal.classList.add('anim-fade-out'); setTimeout(() => modal.classList.add('hidden'), 280); } catch {}
        }, 30000);
    }

    // Method to get user count
    getConnectedUserCount() {
        return Object.values(this.panels).filter(panel => !panel.isEmpty).length;
    }

    // Set references to other systems
    setAudioSystem(audioSystem) {
        this.audioSystem = audioSystem;
    }

    setCharacterSelection(characterSelection) {
        this.characterSelection = characterSelection;
    }
}

// Initialize Discord integration when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.discordIntegration = new DiscordIntegration();
    
    // Set up cross-references when other systems are available
    setTimeout(() => {
        if (window.characterSelection) {
            window.discordIntegration.setCharacterSelection(window.characterSelection);
        }
        if (window.audioSystem) {
            window.discordIntegration.setAudioSystem(window.audioSystem);
            window.characterSelection.setAudioSystem(window.audioSystem);
        }
    }, 1000);
});

// Helper: canonicalize character ID (handles spelling variations)
DiscordIntegration.prototype.canonicalizeCharacterId = function(id) {
    if (!id) return '';
    if (window.OHRAssets && window.OHRAssets.canonicalizeId) {
        return window.OHRAssets.canonicalizeId(id);
    }
    if (window.characterSelection && window.characterSelection.canonicalizeId) {
        return window.characterSelection.canonicalizeId(id);
    }
    // Fallback: simple normalization with common mappings
    const norm = (id || '').toString().toLowerCase().replace(/[\s\.:]/g, '');
    const CANON_MAP = { 'torbjörn': 'torbjorn', 'winstonn': 'winston', 'winnston': 'winston', 'brigette': 'brigitte' };
    if (CANON_MAP[norm]) return CANON_MAP[norm];
    return norm.normalize ? norm.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') : norm;
};

// Helper: choose a stable AI avatar per slot
DiscordIntegration.prototype.getAiAvatarForSlot = function(slotId) {
    try {
        const files = [
            'alex-b2.png','cameron.png','hubert.png','hugby.png','J4ck.png','jimmy.png','Leason-6p.png','scrupple.png','Sm1th.png','terminator.png','u-boy.png'
        ];
        const idx = Math.abs((slotId || 1) - 1) % files.length;
        return `../images/ai_profiles/${files[idx]}`;
    } catch { return null; }
}; 