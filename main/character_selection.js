/**
 * Overwatch-Style Character Selection System for OHR
 * Handles character selection with grid display, central preview, and stats
 */

// ################################################################################
// # Character Selection Overlay (Client-side)
// #
// # Sections:
// # 1) Constructor & Init
// # 2) Data Loading (character_database.json)
// # 3) Overlay & Grid Rendering
// # 4) Selection & Lock-in Flow
// # 5) Image Fallback Handling
// # 6) Utilities (capitalization, audio hooks)
// ################################################################################

class CharacterSelection {
    constructor() {
        this.characters = null;
        this.selectedCharacter = null;
        this.currentUserPanel = null;
        this.overlay = null;
        this.isInitialized = false;
        this.audioSystem = null;
        this.takenCharacters = new Set(); // normalized ids currently taken (server-authoritative)
        this.imageCache = new Map(); // id -> HTMLImageElement
        this.lastPreviewId = null;
        this.EXCLUDED_IDS = new Set(['lifeweaver','ana']);
        this.CANON_MAP = { 'torbjörn': 'torbjorn', 'winstonn': 'winston', 'winnston': 'winston', 'brigette': 'brigitte' };
        
        this.init();
    }

    canonicalizeId(id) {
        if (window.OHRAssets && window.OHRAssets.canonicalizeId) return window.OHRAssets.canonicalizeId(id);
        const n = this.normalizeId(id);
        if (this.CANON_MAP[n]) return this.CANON_MAP[n];
        return n.normalize ? n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') : n;
    }

    async init() {
        try {
            // Load character database
            await this.loadCharacterDatabase();
            
            // Initialize overlay elements
            this.initializeOverlay();
            
            // Create character grid
            this.createCharacterGrid();
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.isInitialized = true;
            console.log('Overwatch Character Selection system initialized');
        } catch (error) {
            console.error('Failed to initialize Character Selection:', error);
        }
    }

    async loadCharacterDatabase() {
        try {
            const response = await fetch('./character_database.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.characters = data.characters;
            this.rosterInfo = data.roster_info;
            
            console.log('Character database loaded:', Object.keys(this.characters).length, 'characters');
        } catch (error) {
            console.error('Error loading character database:', error);
            this.characters = {};
        }
    }

    initializeOverlay() {
        this.overlay = document.getElementById('character-selection-overlay');
        
        if (!this.overlay) {
            console.error('Character selection overlay not found');
            return;
        }
    }

    createCharacterGrid() {
        const gridContainer = document.getElementById('character-grid-container');
        if (!gridContainer) {
            console.error('Character grid container not found');
            return;
        }

        gridContainer.innerHTML = '';
        // Build role sections (exclude announcers)
        const byRole = { tank: [], damage: [], support: [] };
        Object.keys(this.characters).forEach(id => {
            const c = this.characters[id];
            const key = (c.role || '').toLowerCase();
            let norm = this.canonicalizeId(id);
            if (this.EXCLUDED_IDS.has(norm)) return;
            if (byRole[key]) byRole[key].push(norm);
        });

        const makeHeader = (text, cls) => {
            const hwrap = document.createElement('div');
            hwrap.className = 'role-section';
            const h = document.createElement('div');
            h.className = `role-header ${cls}`;
            h.textContent = text;
            hwrap.appendChild(h);
            return hwrap;
        };

        const makeRoleGrid = (ids) => {
            const grid = document.createElement('div');
            grid.className = 'role-grid';
            ids.forEach(characterId => {
                // Look up character by canonicalized ID (handle spelling variations)
                const canonId = this.canonicalizeId(characterId);
                const character = this.characters[canonId] || this.characters[characterId];
                if (!character) return; // Skip if character not found
                
                const isTaken = this.isCharacterTaken(characterId);
                const icon = document.createElement('div');
                icon.className = `character-icon ${isTaken ? 'unavailable' : ''}`;
                icon.dataset.characterId = canonId; // Use canonical ID
                // wuyang coming soon
                if (canonId === 'wuyang') { icon.classList.add('unavailable'); icon.setAttribute('data-badge', 'COMING SOON'); }
                const img = document.createElement('img');
                img.alt = character.display_name;
                if (window.OHRAssets && window.OHRAssets.applyRosterSrc) {
                    window.OHRAssets.applyRosterSrc(img, canonId, character.assets);
                } else {
                    img.src = `../images/current_roster/${canonId}_roster.png`;
                    img.onerror = () => this.handleRosterImageError(img, canonId, character.display_name);
                }
                icon.appendChild(img);
                if (!isTaken && canonId !== 'wuyang') icon.addEventListener('click', () => this.selectCharacter(canonId));
                grid.appendChild(icon);
            });
            return grid;
        };

        // One role-row with three groups spaced across
        const row = document.createElement('div');
        row.className = 'role-row';
        const left = document.createElement('div'); left.className = 'role-group';
        const center = document.createElement('div'); center.className = 'role-group';
        const right = document.createElement('div'); right.className = 'role-group';
        left.appendChild(makeHeader('TANK', 'role-header--tank'));
        left.appendChild(makeRoleGrid(byRole.tank || []));
        center.appendChild(makeHeader('DAMAGE', 'role-header--damage'));
        center.appendChild(makeRoleGrid(byRole.damage || []));
        right.appendChild(makeHeader('SUPPORT', 'role-header--support'));
        right.appendChild(makeRoleGrid(byRole.support || []));
        row.appendChild(left); row.appendChild(center); row.appendChild(right);
        gridContainer.appendChild(row);
    }

    selectCharacter(characterId) {
        if (!this.characters[characterId]) return;

        const character = this.characters[characterId];
        this.selectedCharacter = characterId;

        // Update character icon selection
        document.querySelectorAll('.character-icon').forEach(icon => {
            icon.classList.remove('selected');
        });
        
        const selectedIcon = document.querySelector(`[data-character-id="${characterId}"]`);
        if (selectedIcon) {
            selectedIcon.classList.add('selected');
        }

        // Update central display
        this.updateCentralDisplay(character);

        // Enable lock in button
        const lockInButton = document.getElementById('lock-in-button');
        if (lockInButton) {
            lockInButton.disabled = false;
        }

        // Play selection sound if available
        if (this.audioSystem && this.audioSystem.playButtonSound) {
            this.audioSystem.playButtonSound();
        }
    }

    updateCentralDisplay(character) {
        const stage = document.getElementById('character-hero-stage');
        const statBlock = document.getElementById('selection-stat-block');
        if (stage) {
            stage.classList.add('has-selection');
            stage.setAttribute('aria-hidden', 'false');
        }
        if (statBlock) statBlock.classList.remove('hidden');

        const characterImage = document.getElementById('selected-character-image');
        if (characterImage) {
            const id = this.canonicalizeId(character.id);
            if (window.OHRAssets && window.OHRAssets.applyHorseFullSrc) {
                window.OHRAssets.applyHorseFullSrc(characterImage, id, character.assets);
            } else {
                characterImage.src = character.assets?.portrait_large || `../images/current_roster/${id}_horse_full.png`;
                characterImage.onerror = () => this.handleLargeImageError(characterImage, character);
            }
            characterImage.classList.add('overlap-mode');
            this.lastPreviewId = id;
        }

        const characterName = document.getElementById('character-name');
        if (characterName) characterName.textContent = character.display_name;

        const characterRole = document.getElementById('character-role');
        if (characterRole) characterRole.textContent = character.role || '';

        const abilityName = (character.ability && character.ability.name) ? character.ability.name : '—';
        const abilityDesc = (character.ability && character.ability.description) ? character.ability.description : '';
        const abEl = document.getElementById('ability-name');
        const abDesc = document.getElementById('ability-desc');
        if (abEl) abEl.textContent = abilityName;
        if (abDesc) abDesc.textContent = abilityDesc;

        const s = character.stats || {};
        this.updateStatBars({
            speed: s.speed ?? 70,
            power: s.power ?? 70,
            stamina: s.stamina ?? 70,
            determination: s.determination ?? 70,
        });
    }

    updateStatBars(stats) {
        const setBar = (key, value) => {
            const bar = document.getElementById(`${key}-bar`);
            const val = document.getElementById(`${key}-value`);
            const n = Math.max(0, Math.min(100, Number(value) || 0));
            if (bar) bar.style.width = `${n}%`;
            if (val) val.textContent = String(Math.round(n));
        };
        setBar('speed', stats.speed);
        setBar('power', stats.power);
        setBar('stamina', stats.stamina);
        setBar('determination', stats.determination);
    }

    setupEventListeners() {
        const lockInButton = document.getElementById('lock-in-button');
        if (lockInButton) {
            lockInButton.addEventListener('click', () => this.lockInCharacter());
        }

        const cancelButton = document.getElementById('cancel-selection');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.closeSelection());
        }

        const closeX = document.getElementById('selection-close-x');
        if (closeX) {
            closeX.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeSelection();
            });
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.closeSelection();
                }
            });
        }
    }

    openSelection(userPanelId = null) {
        if (!this.isInitialized) {
            console.warn('Character selection not initialized yet');
            return;
        }

        this.currentUserPanel = userPanelId;
        
        if (this.overlay) {
            this.overlay.classList.remove('hidden');
            
            // Reset selection state
            this.selectedCharacter = null;
            document.querySelectorAll('.character-icon').forEach(icon => {
                icon.classList.remove('selected');
            });
            
            const lockInButton = document.getElementById('lock-in-button');
            if (lockInButton) {
                lockInButton.disabled = true;
            }

            // Reset central display
            // If server already has a selection for this user, show it
            try {
                const panel = window.discordIntegration?.panels?.[userPanelId];
                const cid = panel?.character?.id || null;
                const character = cid ? this.characters[cid] : null;
                if (character) {
                    this.updateCentralDisplay(character);
                } else {
                    this.resetCentralDisplay();
                }
            } catch { this.resetCentralDisplay(); }
        }
    }

    closeSelection() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
        this.currentUserPanel = null;
        this.selectedCharacter = null;
        this.resetCentralDisplay();
    }

    lockInCharacter() {
        if (!this.selectedCharacter || !this.currentUserPanel) {
            console.warn('No character selected or no user panel specified');
            return;
        }

        const character = this.characters[this.selectedCharacter];
        const panel = window.discordIntegration?.panels?.[this.currentUserPanel];
        
        // Check if already locked - if so, and timer > 15 seconds, allow unlocking/changing
        if (panel && panel.locked) {
            // Get current intermission timer
            const timer = window.ohrGameEngine?.intermissionTimer || 180;
            if (timer > 15) {
                // Allow changing character if timer > 15 seconds
                // Unlock first, then proceed with new selection
                if (window.backendClient && panel.user?.id) {
                    try { 
                        // Note: Backend doesn't have unlock endpoint, so we'll unlock locally
                        // and select new character, then lock again
                        panel.locked = false;
                        window.discordIntegration.updatePanelDisplay(this.currentUserPanel);
                    } catch {}
                }
            } else {
                // Timer <= 15 seconds - cannot change
                console.warn('Cannot change character when timer is 15 seconds or less');
                return;
            }
        }
        
        // Prevent lock if character became taken meanwhile
        if (this.isCharacterTaken(character.id)) {
            console.warn('Character is already taken');
            return;
        }
        
        // Update the Discord panel with selected character
        if (window.discordIntegration) {
            window.discordIntegration.setCharacterForPanel(this.currentUserPanel, character);
        }

        // Explicit lock-in API call now; panel button text is handled by DiscordIntegration based on phase
        if (window.backendClient && window.discordIntegration?.panels?.[this.currentUserPanel]?.user?.id) {
            try { window.backendClient.lockIn(window.discordIntegration.panels[this.currentUserPanel].user.id); } catch {}
        }
        
        // Play lock in sound if available
        if (this.audioSystem && this.audioSystem.playLockInSound) {
            this.audioSystem.playLockInSound();
        }
        
        // Close selection
        this.closeSelection();
        
        console.log(`Character ${character.display_name} locked in for panel ${this.currentUserPanel}`);
    }



    resetCentralDisplay() {
        const stage = document.getElementById('character-hero-stage');
        const statBlock = document.getElementById('selection-stat-block');
        if (stage) {
            stage.classList.remove('has-selection');
            stage.setAttribute('aria-hidden', 'true');
        }
        if (statBlock) statBlock.classList.add('hidden');

        const characterImage = document.getElementById('selected-character-image');
        if (characterImage) {
            characterImage.src = '';
            characterImage.onerror = null;
        }

        const characterName = document.getElementById('character-name');
        if (characterName) characterName.textContent = 'Select a Hero';

        const characterRole = document.getElementById('character-role');
        if (characterRole) characterRole.textContent = '';

        const abEl = document.getElementById('ability-name');
        const abDesc = document.getElementById('ability-desc');
        if (abEl) abEl.textContent = '—';
        if (abDesc) abDesc.textContent = '';

        this.updateStatBars({
            speed: 0,
            power: 0,
            stamina: 0,
            determination: 0,
        });
        ['speed-value','power-value','stamina-value','determination-value'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
    }

    // === Taken characters (server-authoritative) ===
    normalizeId(id) { return (id || '').toString().toLowerCase().replace(/[\s\.:]/g, ''); }
    isCharacterTaken(id) { return this.takenCharacters.has(this.normalizeId(id)); }
    markCharacterTaken(id, taken = true) {
        const key = this.normalizeId(id);
        if (!key) return;
        if (taken) this.takenCharacters.add(key); else this.takenCharacters.delete(key);
        // Update specific icon if present
        try {
            const icon = document.querySelector(`.character-icon[data-character-id="${key}"]`);
            if (icon) {
                if (taken) {
                    icon.classList.add('unavailable');
                    // Remove existing click handler by cloning
                    const clone = icon.cloneNode(true);
                    icon.parentNode.replaceChild(clone, icon);
                } else {
                    icon.classList.remove('unavailable');
                    // Reattach click only if character is in available roster
                    const available = ['reinhardt','torbjorn','soldier76','mercy','brigitte','orisa','dva'];
                    if (available.includes(key)) {
                        clone.addEventListener('click', () => this.selectCharacter(key));
                    }
                }
            }
        } catch {}
    }
    setTakenCharactersFromPlayers(playersMap) {
        try {
            const next = new Set();
            for (let i = 1; i <= 6; i++) {
                const p = playersMap[i];
                if (p && p.characterId) next.add(this.normalizeId(p.characterId));
            }
            this.takenCharacters = next;
            // Re-render grid to reflect taken states
            this.createCharacterGrid();
        } catch {}
    }

    // === Auto-lock on intermission timeout ===
    autoLockIfNeeded() {
        try {
            const lockInButton = document.getElementById('lock-in-button');
            if (!lockInButton || !this.currentUserPanel) return;
            const alreadySelected = !!this.selectedCharacter;
            if (!alreadySelected) {
                // prefer last previewed or role-balanced random
                let pick = this.lastPreviewId && !this.isCharacterTaken(this.lastPreviewId) ? this.lastPreviewId : null;
                if (!pick) {
                    const icons = Array.from(document.querySelectorAll('.character-icon')).filter(el => !el.classList.contains('unavailable'));
                    if (icons.length) pick = icons[Math.floor(Math.random() * icons.length)].dataset.characterId;
                }
                if (pick) this.selectCharacter(pick);
            }
            // Lock-in if enabled
            const disabled = lockInButton.disabled;
            if (!disabled) { lockInButton.click(); }
        } catch {}
    }

    // Image error handling methods
    handleRosterImageError(imgElement, characterId, displayName) {
        // Try different path variations for roster images (current_roster only)
        // Ensure we use canonicalized ID
        const canonId = this.canonicalizeId(characterId);
        const fallbackPaths = [
            `../images/current_roster/${canonId}_roster.png`, // Try canonical ID first
            `../images/current_roster/${characterId}_roster.png`, // Original ID as fallback
            `../images/current_roster/${displayName.toLowerCase()}_roster.png`,
            `../images/current_roster/${this.capitalizeFirst(canonId)}_roster.png`,
            `../images/current_roster/${displayName}_roster.png`,
            // Winston-specific fallbacks (winnston -> winston)
            canonId === 'winston' ? `../images/current_roster/winnston_roster.png` : null,
            // Brigitte-specific fallbacks (brigette -> brigitte)
            canonId === 'brigitte' ? `../images/current_roster/brigette_roster.png` : null
        ].filter(path => path !== null);
        
        this.tryImagePaths(imgElement, fallbackPaths, 0);
    }

    handleLargeImageError(imgElement, character) {
        // Try different path variations for horse_full images (current_roster only)
        // Handle case variations like Horse_Full, _Full, etc.
        const characterId = character.id;
        const id = this.normalizeId(characterId);
        const displayName = character.display_name;
        
        const fallbackPaths = [
            character.assets?.portrait_large || null,
            `../images/current_roster/${id}_horse_full.png`,
            `../images/current_roster/${id}_Horse_Full.png`,
            `../images/current_roster/${id}_horse_Full.png`,
            `../images/current_roster/${characterId}_horse_full.png`,
            `../images/current_roster/${characterId}_Horse_Full.png`,
            `../images/current_roster/${displayName.toLowerCase()}_horse_full.png`,
            `../images/current_roster/${displayName.toLowerCase()}_Horse_Full.png`
        ].filter(path => path !== null); // Remove null entries
        
        this.tryImagePaths(imgElement, fallbackPaths, 0);
    }

    tryFullViewImage(imgElement, character) {
        const id = this.normalizeId(character.id);
        
        // Start with the most likely path (current_roster)
        const primaryPath = character.assets?.portrait_large || `../images/current_roster/${id}_horse_full.png`;
        imgElement.src = primaryPath;
        imgElement.onerror = () => this.handleLargeImageError(imgElement, character);
    }

    tryImagePaths(imgElement, paths, index) {
        if (index >= paths.length) {
            // All paths failed, show placeholder
            imgElement.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjNDA0ZDcwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD4KPHN2Zz4=';
            imgElement.alt = 'Image not found';
            return;
        }
        
        const currentPath = paths[index];
        const testImg = new Image();
        testImg.onload = () => {
            // Image loaded successfully
            imgElement.src = currentPath;
            imgElement.onerror = null; // Remove error handler
        };
        testImg.onerror = () => {
            // Try next path
            this.tryImagePaths(imgElement, paths, index + 1);
        };
        testImg.src = currentPath;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Method to set audio system reference
    setAudioSystem(audioSystem) {
        this.audioSystem = audioSystem;
    }
}

// Initialize character selection when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.characterSelection = new CharacterSelection();
});