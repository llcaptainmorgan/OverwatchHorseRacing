/**
 * OHR Main Application - System Integration and Initialization
 * Ties together all game systems and handles global application state
 */

class OHRMainApp {
    constructor() {
        this.isInitialized = false;
        this.gameEngine = null;
        this.audioSystem = null;
        this.characterSelection = null;
        this.connectedUsers = [];
        this.currentUser = null;
        this.sessionTtlMsRemaining = null;
        this.sessionTtlTimer = null;
        this.notificationCenter = null;
        
        this.init();
    }

    async init() {
        try {
            console.log('Initializing OHR Main Application...');
            
            // Wait for DOM to be fully loaded
            if (document.readyState !== 'complete') {
                await new Promise(resolve => {
                    window.addEventListener('load', resolve);
                });
            }
            
            // Initialize systems in correct order
            await this.initializeSystems();
            
            // Set up cross-system communication
            this.connectSystems();
            
            // Set up global event handlers
            this.setupGlobalEventHandlers();
            
            // Apply initial UI configuration and splash gating
            await this.applyInitialConfiguration();
            
            // Initialize notifications after DOM ready
            this.notificationCenter = new NotificationCenter();
            window.notify = (msg, kind) => this.notificationCenter?.push(msg, kind);

            this.isInitialized = true;
            console.log('OHR Main Application initialized successfully!');
            
        } catch (error) {
            console.error('Failed to initialize OHR Main Application:', error);
        }
    }

    async initializeSystems() {
        // Wait for systems to be available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while ((!window.gameEngine || !window.audioSystem || !window.characterSelection) && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            console.warn('Some systems may not have loaded properly');
        }
        
        // Get references to global systems
        this.gameEngine = window.gameEngine;
        this.audioSystem = window.audioSystem;
        this.characterSelection = window.characterSelection;
        
        console.log('Systems references acquired:', {
            gameEngine: !!this.gameEngine,
            audioSystem: !!this.audioSystem,
            characterSelection: !!this.characterSelection
        });
    }

    connectSystems() {
        if (this.gameEngine && this.audioSystem) {
            this.gameEngine.setAudioSystem(this.audioSystem);
            this.audioSystem.setGameEngine(this.gameEngine);
        }
        
        // Connect cheer button to game engine
        this.setupCheerButton();
        
        // Set up Discord user management
        this.setupDiscordIntegration();

        // Listen to server state to seed TTL countdown
        document.addEventListener('serverState', (ev) => {
            try {
                const meta = ev.detail && ev.detail.session_meta;
                if (meta && typeof meta.expires_at === 'number') {
                    const now = Date.now();
                    this.sessionTtlMsRemaining = Math.max(0, meta.expires_at - now);
                    this.startSessionTtlCountdown();
                    // Warning at 15 minutes
                    if (this.sessionTtlMsRemaining <= 15 * 60 * 1000 && !this._warned15) {
                        this._warned15 = true;
                        this.notificationCenter?.push('Warning: Server will close in 15 minutes.', 'warning');
                    }
                }
            } catch {}
        });
    }

    setupCheerButton() {
        const cheerButton = document.getElementById('cheer-button');
        if (cheerButton && this.gameEngine) {
            cheerButton.addEventListener('click', () => {
                const selectedCharacter = this.characterSelection?.getSelectedCharacter();
                if (selectedCharacter && this.gameEngine.getCurrentGameState() === 'racing') {
                    this.gameEngine.cheerForCharacter(selectedCharacter.id);
                    
                    // Add cooldown effect
                    this.addCheerCooldown(cheerButton);
                }
            });
        }
    }

    addCheerCooldown(button) {
        button.disabled = true;
        const cooldownBar = button.querySelector('#cheer-cooldown');
        
        if (cooldownBar) {
            cooldownBar.style.width = '100%';
            
            // Animate cooldown
            const duration = 3000; // 3 seconds
            const startTime = Date.now();
            
            const updateCooldown = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.max(0, (duration - elapsed) / duration);
                
                cooldownBar.style.width = (progress * 100) + '%';
                
                if (progress > 0) {
                    requestAnimationFrame(updateCooldown);
                } else {
                    button.disabled = false;
                }
            };
            
            updateCooldown();
        } else {
            // Fallback without visual cooldown
            setTimeout(() => {
                button.disabled = false;
            }, 3000);
        }
    }

    setupDiscordIntegration() {
        // Placeholder for Discord integration
        const discordButton = document.getElementById('discord-login');
        if (discordButton) {
            discordButton.addEventListener('click', () => {
                this.handleDiscordLogin();
            });
        }
        
        // Set up user display area
        this.updateConnectedUsersDisplay();
    }

    handleDiscordLogin() {
        // Placeholder Discord login - in real implementation this would use Discord OAuth
        console.log('Discord login clicked - implement OAuth flow here');
        
        // For demo purposes, simulate a login
        this.simulateUserLogin();
    }

    simulateUserLogin() {
        // Simulate a Discord user login for demo
        const demoUser = {
            id: 'demo_user_' + Date.now(),
            username: 'DemoUser#1234',
            avatar: null,
            selectedCharacter: null
        };
        
        this.currentUser = demoUser;
        this.connectedUsers.push(demoUser);
        
        // Update UI
        const usernameElement = document.getElementById('username');
        const discordButton = document.getElementById('discord-login');
        
        if (usernameElement) {
            usernameElement.textContent = demoUser.username;
        }
        
        if (discordButton) {
            discordButton.style.display = 'none';
        }
        
        // Enable character selection
        const selectCharacterBtn = document.getElementById('select-character-btn');
        if (selectCharacterBtn) {
            selectCharacterBtn.disabled = false;
        }
        
        this.updateConnectedUsersDisplay();
    }

    updateConnectedUsersDisplay() {
        const connectedUsersContainer = document.getElementById('connected-users');
        if (!connectedUsersContainer) return;
        
        if (this.connectedUsers.length === 0) {
            connectedUsersContainer.innerHTML = '<div class="no-users">No users connected</div>';
            return;
        }
        
        connectedUsersContainer.innerHTML = this.connectedUsers.map(user => `
            <div class="user-card" data-user-id="${user.id}">
                <div class="user-avatar">
                    ${user.avatar ? `<img src="${user.avatar}" alt="${user.username}">` : user.username.charAt(0)}
                </div>
                <div class="user-info">
                    <div class="username">${user.username}</div>
                    <div class="character-choice">
                        ${user.selectedCharacter ? user.selectedCharacter.display_name : 'No character'}
                    </div>
                </div>
                <button class="user-cheer-btn" data-character-id="${user.selectedCharacter?.id || ''}" 
                        ${!user.selectedCharacter ? 'disabled' : ''}>
                    CHEER!
                </button>
            </div>
        `).join('');
        
        // Add event listeners to cheer buttons
        this.setupUserCheerButtons();
    }

    setupUserCheerButtons() {
        const cheerButtons = document.querySelectorAll('.user-cheer-btn');
        cheerButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const characterId = e.target.dataset.characterId;
                if (characterId && this.gameEngine) {
                    this.gameEngine.cheerForCharacter(characterId);
                    
                    // Add visual feedback
                    e.target.style.transform = 'scale(0.9)';
                    setTimeout(() => {
                        e.target.style.transform = 'scale(1)';
                    }, 150);
                }
            });
        });
    }

    setupGlobalEventHandlers() {
        // Character selection event
        document.addEventListener('characterSelected', (event) => {
            const character = event.detail.character;
            console.log('Character selected:', character.display_name);
            
            // Update current user's selection
            if (this.currentUser) {
                this.currentUser.selectedCharacter = character;
                this.updateConnectedUsersDisplay();
            }
            
            // Enable cheer button
            const cheerButton = document.getElementById('cheer-button');
            if (cheerButton) {
                cheerButton.disabled = false;
            }
        });
        
        // Game state changes
        document.addEventListener('gameStateChanged', (event) => {
            const newState = event.detail.state;
            this.handleGameStateChange(newState);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
        
        // Window visibility change (pause music when tab not active)
        document.addEventListener('visibilitychange', () => {
            if (this.audioSystem) {
                if (document.hidden) {
                    // Tab is not visible - lower volume
                    this.audioSystem.setVolume(this.audioSystem.getVolume() * 0.3);
                } else {
                    // Tab is visible - restore volume
                    this.audioSystem.setVolume(this.audioSystem.getVolume() / 0.3);
                }
            }
        });
    }

    handleGameStateChange(newState) {
        console.log('Game state changed to:', newState);
        
        // Update UI based on game state
        switch (newState) {
            case 'intermission':
                this.handleIntermissionStart();
                break;
            case 'racing':
                this.handleRaceStart();
                break;
            case 'results':
                this.handleRaceResults();
                break;
        }
    }

    handleIntermissionStart() {
        // Enable character selection
        const selectCharacterBtn = document.getElementById('select-character-btn');
        if (selectCharacterBtn) {
            selectCharacterBtn.disabled = false;
        }
        
        // Show intermission-specific UI elements
        console.log('Intermission started - character selection enabled');
    }

    handleRaceStart() {
        // Disable character selection
        const selectCharacterBtn = document.getElementById('select-character-btn');
        if (selectCharacterBtn) {
            selectCharacterBtn.disabled = true;
        }
        
        console.log('Race started - character selection disabled');
    }

    handleRaceResults() {
        console.log('Race finished - showing results');
    }

    handleKeyboardShortcuts(e) {
        // Only handle shortcuts if no input is focused
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }
        
        switch (e.key.toLowerCase()) {
            case 'c':
                if (this.characterSelection) {
                    this.characterSelection.showCharacterSelection();
                }
                break;
            case 's':
                if (this.gameEngine && this.gameEngine.getCurrentGameState() === 'results') {
                    document.getElementById('scoreboard-modal')?.classList.remove('hidden');
                }
                break;
            case ' ':
                e.preventDefault();
                if (this.audioSystem) {
                    this.audioSystem.togglePlayPause();
                }
                break;
            case 'escape':
                // Close any open modals
                document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                    modal.classList.add('hidden');
                });
                break;
        }
    }

    async applyInitialConfiguration() {
        // Apply UI configuration
        // UI Configuration removed - now handled via CSS custom properties
        
        // Set initial volumes
        if (this.audioSystem) {
            this.audioSystem.setVolume(0.7);
            this.audioSystem.setSFXVolume(0.8);
        }
        
        // Set up splash screen
        await this.setupSplashScreen();
        
        // Don't auto-start music - wait for user interaction
    }

    startSessionTtlCountdown() {
        if (this.sessionTtlTimer) { try { clearInterval(this.sessionTtlTimer); } catch {} this.sessionTtlTimer = null; }
        if (this.sessionTtlMsRemaining == null) return;
        const el = document.getElementById('session-timer');
        const render = () => {
            const sec = Math.max(0, Math.floor(this.sessionTtlMsRemaining / 1000));
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            if (el) el.textContent = `Session ends in: ${h > 0 ? String(h).padStart(2,'0') + ':' : ''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        };
        render();
        this.sessionTtlTimer = setInterval(() => {
            this.sessionTtlMsRemaining -= 1000;
            if (this.sessionTtlMsRemaining <= 0) {
                this.sessionTtlMsRemaining = 0;
                try { clearInterval(this.sessionTtlTimer); } catch {}
                this.sessionTtlTimer = null;
            }
            render();
        }, 1000);
    }

    async setupSplashScreen() {
        const splashScreen = document.getElementById('splash-screen');
        const enterButton = document.getElementById('enter-app');
        const gameContainer = document.getElementById('game-container');
        
        if (!splashScreen || !enterButton || !gameContainer) return;

        // Debounce click helper
        let clicked = false;
        const oneShot = (fn) => {
            if (clicked) return; clicked = true; try { fn(); } finally { /* no-op */ }
        };

        const hideLoading = () => {
            const loadingTxt = document.getElementById('splash-loading');
            const spinner = document.getElementById('splash-spinner');
            if (loadingTxt) loadingTxt.style.display = 'none';
            if (spinner) spinner.style.display = 'none';
        };

        const isDev = !!(window.BACKEND_CONFIG && window.BACKEND_CONFIG.isDevelopment);

        const persistLocalUser = (u) => {
            if (!u || !u.discordId) return null;
            const user = { id: u.discordId, username: u.username || 'Dev Guest', avatar: u.avatar || null };
            try { localStorage.setItem('ohr_local_user', JSON.stringify(user)); } catch {}
            if (window.discordIntegration) window.discordIntegration.localUser = user;
            return user;
        };

        // If backend configured, gate on auth (Discord or local dev guest)
        const hasBackend = !!(window.backendClient && window.backendClient.baseUrl && !String(window.backendClient.baseUrl).includes('REPLACE_WITH'));
        if (hasBackend) {
            let signedInUser = null;
            try {
                signedInUser = await window.backendClient.authMe(3000);
                if (!signedInUser && isDev) {
                    const guest = await window.backendClient.devGuestLogin();
                    if (guest) signedInUser = guest;
                }
                if (signedInUser && signedInUser.discordId) {
                    persistLocalUser(signedInUser);
                    try {
                        const ctrl = new AbortController();
                        const t = setTimeout(() => ctrl.abort(), 3000);
                        await Promise.race([
                            window.backendClient.ensureSession(),
                            new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('timeout')))),
                        ]);
                        clearTimeout(t);
                    } catch {}
                    hideLoading();
                    this.enterApplication(splashScreen, gameContainer);
                    return;
                }
            } catch {
                // fall through to Create/Join UI
            } finally {
                hideLoading();
            }

            enterButton.style.display = 'none';

            const joinWrap = document.getElementById('session-join');
            if (joinWrap) joinWrap.classList.remove('hidden');

            const codeInput = document.getElementById('session-code-input');
            const joinBtn = document.getElementById('join-session-btn');
            const createBtn = document.getElementById('create-session-btn');
            const hintEl = document.getElementById('join-session-hint');
            const inviteRow = document.getElementById('invite-row');
            const inviteInput = document.getElementById('invite-url-input');
            const copyInviteBtn = document.getElementById('copy-invite-btn');

            const flashCopied = (btn) => {
                if (!btn) return;
                const prev = btn.textContent;
                btn.classList.add('is-copied');
                btn.textContent = 'COPIED';
                setTimeout(() => {
                    btn.classList.remove('is-copied');
                    btn.textContent = prev;
                }, 1400);
            };

            const showInvite = (code) => {
                if (!window.backendClient || !code) return;
                window.backendClient.sessionCode = code;
                if (inviteRow) {
                    inviteRow.hidden = true;
                    inviteRow.classList.add('hidden');
                }
            };

            const pendingSession = (() => {
                try { return (new URL(window.location.href).searchParams.get('session') || '').trim().toUpperCase(); }
                catch { return ''; }
            })();
            if (/^[A-Z0-9]{4}$/.test(pendingSession)) {
                if (codeInput) codeInput.value = pendingSession;
                if (hintEl) {
                    hintEl.textContent = `Joining session ${pendingSession}`;
                    hintEl.classList.remove('hidden');
                }
                showInvite(pendingSession);
            }

            if (copyInviteBtn) {
                copyInviteBtn.onclick = async () => {
                    const code = (codeInput?.value || pendingSession || window.backendClient?.sessionCode || '').trim().toUpperCase();
                    const result = await window.backendClient.copySessionInvite(code);
                    if (inviteInput && result.url) inviteInput.value = result.url;
                    flashCopied(copyInviteBtn);
                };
            }

            const signInBtn = document.getElementById('discord-sign-in');
            if (signInBtn) {
                if (isDev) {
                    signInBtn.style.display = 'none';
                } else {
                    signInBtn.classList.remove('hidden');
                    signInBtn.style.display = '';
                    signInBtn.onclick = () => {
                        const current = new URL(window.location.href);
                        const code = (codeInput?.value || pendingSession || '').trim().toUpperCase();
                        if (/^[A-Z0-9]{4}$/.test(code)) current.searchParams.set('session', code);
                        current.searchParams.delete('backend');
                        const ret = encodeURIComponent(current.toString());
                        window.location.href = `${window.backendClient.baseUrl}/auth/discord/login?return=${ret}`;
                    };
                }
            }

            const enterWithSession = async (code) => {
                const url = new URL(window.location.href);
                url.searchParams.set('session', code);
                url.searchParams.delete('backend');
                window.history.replaceState({}, '', url.toString());
                if (window.backendClient) window.backendClient.sessionCode = code;
                showInvite(code);
                if (isDev && !signedInUser) {
                    try {
                        const guest = await window.backendClient.devGuestLogin();
                        if (guest) persistLocalUser(guest);
                    } catch {}
                }
                this.enterApplication(splashScreen, gameContainer);
            };

            if (joinBtn && codeInput) {
                joinBtn.onclick = () => {
                    const code = (codeInput.value || '').trim().toUpperCase();
                    if (!/^[A-Z0-9]{4}$/.test(code)) return;
                    if (isDev) {
                        enterWithSession(code);
                        return;
                    }
                    const url = new URL(window.location.href);
                    url.searchParams.set('session', code);
                    url.searchParams.delete('backend');
                    const ret = encodeURIComponent(url.toString());
                    window.location.href = `${window.backendClient.baseUrl}/auth/discord/login?return=${ret}`;
                };
            }
            if (createBtn) {
                createBtn.onclick = async () => {
                    try {
                        const resp = await fetch(`${window.backendClient.baseUrl}/sessions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                        });
                        const js = await resp.json();
                        const code = js.sessionCode;
                        if (!code) return;
                        const url = new URL(window.location.href);
                        url.searchParams.set('session', code);
                        url.searchParams.delete('backend');
                        window.history.replaceState({}, '', url.toString());
                        if (window.backendClient) window.backendClient.sessionCode = code;
                        if (codeInput) codeInput.value = code;
                        if (hintEl) {
                            hintEl.textContent = `Session ${code} — copy the invite, then sign in`;
                            hintEl.classList.remove('hidden');
                        }
                        showInvite(code);
                        if (isDev) {
                            await enterWithSession(code);
                            return;
                        }
                    } catch {}
                };
            }
            return;
        }

        // No backend configured → keep legacy Enter flow
        hideLoading();
        enterButton.textContent = 'ENTER';
        enterButton.disabled = false;
        enterButton.style.display = '';
        const joinWrap = document.getElementById('session-join');
        if (joinWrap) joinWrap.classList.remove('hidden');
        enterButton.onclick = () => oneShot(() => this.enterApplication(splashScreen, gameContainer));
    }

    enterApplication(splashScreen, gameContainer) {
        // Surface OAuth error if any
        try {
            const u = new URL(window.location.href);
            const err = u.searchParams.get('oauth_error');
            if (err) {
                const el = document.getElementById('oauth-error');
                if (el) { el.classList.remove('hidden'); el.textContent = `Sign-in error: ${err}`; }
            }
        } catch {}
        // Hide splash screen with animation
        splashScreen.style.animation = 'fadeOut 0.8s ease-in-out';
        
        setTimeout(() => {
            splashScreen.style.display = 'none';
            gameContainer.classList.remove('hidden');
            gameContainer.style.animation = 'fadeIn 0.5s ease-in-out';
            
            // Now it's safe to start background music after user interaction
            if (this.audioSystem) {
                setTimeout(() => {
                    this.audioSystem.playMusic();
                }, 500);
            }
            
            console.log('Application entered successfully');
        }, 800);
    }

    // Public API methods
    getCurrentUser() {
        return this.currentUser;
    }

    getConnectedUsers() {
        return this.connectedUsers;
    }

    isSystemReady() {
        return this.isInitialized;
    }

    // Debug methods
    getSystemStatus() {
        return {
            initialized: this.isInitialized,
            gameEngine: !!this.gameEngine,
            audioSystem: !!this.audioSystem,
            characterSelection: !!this.characterSelection,
            connectedUsers: this.connectedUsers.length,
            currentGameState: this.gameEngine?.getCurrentGameState() || 'unknown'
        };
    }
}

// Lightweight top-drop Notification Center
class NotificationCenter {
    constructor() {
        this.stack = document.querySelector('.notification-stack');
        if (!this.stack) {
            this.stack = document.createElement('div');
            this.stack.className = 'notification-stack';
            document.body.appendChild(this.stack);
        }
    }
    push(message, kind = 'info', timeoutMs = 4000) {
        try {
            const div = document.createElement('div');
            div.className = 'notification' + (kind ? ` notification--${kind}` : '');
            div.textContent = message;
            this.stack.appendChild(div);
            const remove = () => {
                if (!div.parentNode) return;
                div.classList.add('hide');
                setTimeout(() => { div.parentNode && div.parentNode.removeChild(div); }, 210);
            };
            setTimeout(remove, timeoutMs);
            div.addEventListener('click', remove);
        } catch {}
    }
}

// Global application instance
let ohrApp = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ohrApp = new OHRMainApp();
});

// Global access for debugging
window.OHRApp = {
    getApp: () => ohrApp,
    getStatus: () => ohrApp?.getSystemStatus() || { error: 'Not initialized' },
    getGameEngine: () => ohrApp?.gameEngine,
    getAudioSystem: () => ohrApp?.audioSystem
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OHRMainApp;
}