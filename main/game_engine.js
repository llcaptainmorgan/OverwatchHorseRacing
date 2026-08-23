/**
 * OHR Game Engine - Core Game Management 
 * Handles game states, timers, and session management
 */

class OHRGameEngine {
    constructor() {
        this.gameState = 'intermission'; // 'intermission', 'racing', 'results'
        this.intermissionTimer = 180; // 3 minutes
        this.sessionTimer = 10800; // 3 hours
        
        this.timers = {
            intermission: null,
            session: null
        };
        
        this.useServerTimers = this.detectServerAuthoritative();
        
        this.audioSystem = null;
        
        this.init();
    }

    async init() {
        try {
            // Load character database
            await this.loadCharacterData();
            
            // Set up timer displays
            this.initializeTimers();
            
            // Start session management
            this.startSessionManagement();
            
            // Set up event listeners
            this.setupEventListeners();
            
            console.log('OHR Game Engine initialized');
        } catch (error) {
            console.error('Failed to initialize Game Engine:', error);
        }
    }

    async loadCharacterData() {
        try {
            const response = await fetch('./character_database.json');
            const data = await response.json();
            this.characterDatabase = data;
        } catch (error) {
            console.error('Error loading character database:', error);
        }
    }

    initializeTimers() {
        // Create intermission timer display (top right)
        this.createIntermissionTimerDisplay();
        this.hideShotClock();

        // Ensure hanging sign is visible in intermission on load
        if (this.gameState === 'intermission') {
            try { this.showHangingSign(); } catch {}
        }

        // Start intermission timer only if not using server timers
        if (!this.useServerTimers) {
            this.startIntermissionTimer();
        } else {
            // Smooth display tick using last known value from server
            if (this.timers.intermission) { try { clearInterval(this.timers.intermission); } catch {} this.timers.intermission = null; }
            this.timers.intermission = setInterval(() => {
                // In server-authoritative mode, we only render; do not change phases locally
                const el = document.getElementById('timer-value');
                if (typeof this.intermissionTimer === 'number' && el) {
                    // Decrement visually by 1s; will be resynced by server deltas
                    this.intermissionTimer = Math.max(0, this.intermissionTimer - 1);
                    el.textContent = this.formatTime(this.intermissionTimer);
                }
            }, 1000);
        }
    }

    createIntermissionTimerDisplay() {
        // Remove existing timer if it exists
        const existingTimer = document.getElementById('intermission-timer');
        if (existingTimer) {
            existingTimer.remove();
        }

        // Create intermission timer display
        const timerDisplay = document.createElement('div');
        timerDisplay.id = 'intermission-timer';
        // Use CSS class that has the actual styles
        timerDisplay.className = 'intermission-timer-display';
        timerDisplay.innerHTML = `
            <div class="timer-label">NEXT RACE</div>
            <div class="timer-value" id="timer-value">${this.formatTime(this.intermissionTimer)}</div>
            <button id="rush-button" class="rush-button" title="Start the race now">RUSH</button>
        `;

        const host = document.getElementById('intermission-timer-host');
        if (host) {
            host.appendChild(timerDisplay);
            host.setAttribute('aria-hidden', 'false');
        } else {
            document.body.appendChild(timerDisplay);
        }

        // Wire Rush button: prefer backend start; fallback to local state change
        const rushBtn = document.getElementById('rush-button');
        if (rushBtn) {
            rushBtn.addEventListener('click', async () => {
                rushBtn.disabled = true;
                try {
                    const hasBackend = !!(window.backendClient && window.backendClient.baseUrl && !String(window.backendClient.baseUrl).includes('REPLACE_WITH'));
                    if (hasBackend) {
                        try {
                            await window.backendClient.ensureSession();
                        } catch {}
                        await window.backendClient.startRace();
                    } else {
                        // Local fallback for offline demo
                        this.setGameState('racing');
                        this.hideIntermissionElements();
                    }
                } catch (err) {
                    console.warn('Rush failed:', err);
                } finally {
                    // Re-enable after a short delay to prevent spam
                    setTimeout(() => { try { rushBtn.disabled = false; } catch {} }, 1500);
                }
            });
        }
    }

    startIntermissionTimer() {
        this.timers.intermission = setInterval(() => {
            if (this.useServerTimers) return; // server-authoritative: do not tick local timer
            this.intermissionTimer--;

            // Update display
            const timerValueElement = document.getElementById('timer-value');
            if (timerValueElement) {
                timerValueElement.textContent = this.formatTime(this.intermissionTimer);
            }

            // Start race when timer ends
            if (this.intermissionTimer <= 0) {
                this.startLocalShotClock();
                this.intermissionTimer = 180; // Reset for next race
            }
        }, 1000);
    }

    startSessionManagement() {
        this.timers.session = setInterval(() => {
            this.sessionTimer--;

            if (this.sessionTimer <= 0) {
                this.endSession();
            }
        }, 1000);
    }

    endSession() {
        console.log('Session ended');
        // Clear all timers
        Object.values(this.timers).forEach(timer => {
            if (timer) clearInterval(timer);
        });
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    setShotClock(value, opts = {}) {
        const root = document.getElementById('shot-clock');
        if (!root) return;
        const go = !!(opts.go || value === 'GO');
        const label = root.querySelector('.shot-clock-label');
        const text = go ? 'GO' : String(value);
        root.classList.remove('is-off');
        root.setAttribute('aria-hidden', 'false');
        root.classList.toggle('shot-clock--go', go);
        if (label) label.style.visibility = go ? 'hidden' : 'visible';
        root.querySelectorAll('.shot-clock-ghost, .shot-clock-face').forEach((el) => {
            el.textContent = text;
        });
        root.classList.remove('shot-clock--punch');
        void root.offsetWidth;
        root.classList.add('shot-clock--punch');
        this._shotClockVisible = true;
        if (go) {
            if (this._shotClockGoHide) clearTimeout(this._shotClockGoHide);
            this._shotClockGoHide = setTimeout(() => this.hideShotClock(), 1100);
        }
    }

    hideShotClock() {
        const root = document.getElementById('shot-clock');
        if (!root) return;
        root.classList.add('is-off');
        root.setAttribute('aria-hidden', 'true');
        root.classList.remove('shot-clock--punch', 'shot-clock--go');
        this._shotClockVisible = false;
    }

    startLocalShotClock() {
        this.hideIntermissionElements();
        let n = 10;
        this.setShotClock(n);
        if (this.timers.shotClock) clearInterval(this.timers.shotClock);
        this.timers.shotClock = setInterval(() => {
            n -= 1;
            if (n >= 1) {
                this.setShotClock(n);
                return;
            }
            clearInterval(this.timers.shotClock);
            this.timers.shotClock = null;
            this.setShotClock('GO', { go: true });
            this.setGameState('racing');
        }, 1000);
    }

    showHangingSign() {
        // Remove existing hanging sign if it exists
        const existingSign = document.getElementById('hanging-sign');
        if (existingSign) {
            existingSign.remove();
        }

        const hangingSign = document.createElement('div');
        hangingSign.id = 'hanging-sign';
        hangingSign.className = 'hanging-sign';
        hangingSign.innerHTML = `
            <img src="../images/INTERMISSION_HANGING_SIGN.png" alt="Intermission" class="hanging-sign-img">
        `;

        // Mount on page chrome host (top-center), NOT #race-track —
        // #race-game-container uses transform, which traps position:fixed descendants.
        // Host is top-middle so the sign does not cover #race-hud (track top-right).
        const host = document.getElementById('intermission-timer-host');
        if (host) {
            const timer = document.getElementById('intermission-timer');
            if (timer && timer.parentNode === host) {
                host.insertBefore(hangingSign, timer);
            } else {
                host.prepend(hangingSign);
            }
            host.setAttribute('aria-hidden', 'false');
        } else {
            document.body.appendChild(hangingSign);
        }
    }

    hideHangingSign() {
        const hangingSign = document.getElementById('hanging-sign');
        if (hangingSign) {
            // Animate sign moving off-screen to the right
            hangingSign.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
            hangingSign.style.transform = 'translateX(500px)';
            hangingSign.style.opacity = '0';
            // Remove after animation completes
            setTimeout(() => {
                if (hangingSign.parentNode) {
                    hangingSign.parentNode.removeChild(hangingSign);
                }
            }, 500);
        }
    }

    hideIntermissionElements() {
        this.hideHangingSign();
        
        const timerDisplay = document.getElementById('intermission-timer');
        if (timerDisplay) {
            timerDisplay.style.transition = 'opacity 0.3s ease-out';
            timerDisplay.style.opacity = '0';
            setTimeout(() => {
                timerDisplay.style.display = 'none';
            }, 300);
        }
    }

    setupEventListeners() {
        // Game state change listeners will be handled by racing.js
        
        // Audio system reference
        document.addEventListener('DOMContentLoaded', () => {
            this.audioSystem = window.ohrAudioSystem;
        });
    }

    // Public methods for external modules
    setGameState(newState) {
        this.gameState = newState;
        
        // Show/hide elements based on state
        if (newState === 'intermission') {
            this.hideShotClock();
            this.showHangingSign();
            const timerDisplay = document.getElementById('intermission-timer');
            if (timerDisplay) {
                timerDisplay.style.display = 'block';
            }
        }
        // Broadcast to discord panels so they update button states
        try { document.dispatchEvent(new CustomEvent('gameStateChanged', { detail: { newState } })); } catch {}
    }

    getGameState() {
        return this.gameState;
    }

    detectServerAuthoritative() {
        try {
            return !!(window.backendClient && window.BACKEND_CONFIG && !String(window.BACKEND_CONFIG.backendBaseUrl || '').includes('REPLACE_WITH'));
        } catch { return false; }
    }

    getCharacterDatabase() {
        return this.characterDatabase;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ohrGameEngine = new OHRGameEngine();
});