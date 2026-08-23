/**
 * OHR Audio System - Comprehensive Audio Management
 * Handles music, sound effects, voice lines, and jukebox functionality
 */

class OHRAudioSystem {
    constructor() {
        this.musicTracks = [];
        this.currentTrack = 0;
        this.isPlaying = false;
        this.volume = 0.7;
        this.sfxVolume = 0.8;
        this.announcerMuted = false;
        
        this.audioElements = {
            music: null,
            sfx: null,
            voicelines: null
        };
        
        this.soundLibrary = {
            buttonPress: '../sounds/button_press.wav',
            cheer: '../sounds/cheer.mp3',
            startRace: '../sounds/start_race_sound.mp3'
        };
        
        this.musicLibrary = [
            {
                name: "Ilios Theme",
                file: "../sounds/MUSIC_OW_Ilios.mp3",
                duration: "3:45"
            },
            {
                name: "Dorado Theme", 
                file: "../sounds/MUSIC_OW_Dorado.mp3",
                duration: "4:20"
            },
            {
                name: "Midtown Theme",
                file: "../sounds/MUSIC_OW_midtown.mp3",
                duration: "4:15"
            },
            {
                name: "Katamari - Roll You Up",
                file: "../sounds/MUSIC_KATAMARI_roll_you_up.mp3",
                duration: "5:30"
            },
            {
                name: "Katamari - Lonely Rolling Star",
                file: "../sounds/MUSIC_KATAMARI_lonely_rolling_star.mp3",
                duration: "6:15"
            },
            {
                name: "Master Playlist",
                file: "../sounds/MASTER_PLAYLIST_1h.mp3",
                duration: "60:00"
            }
        ];
        
        this.jukeboxVisible = true;
        
        this.init();
    }

    async init() {
        try {
            // Initialize audio elements
            this.createAudioElements();
            
            // Create jukebox widget
            this.createJukeboxWidget();
            
            // Set up global button sound handlers
            this.setupGlobalSoundHandlers();
            
            // Start with first track
            this.loadTrack(0);
            
            console.log('OHR Audio System initialized');
        } catch (error) {
            console.error('Failed to initialize Audio System:', error);
        }
    }

    createAudioElements() {
        // Music audio element
        this.audioElements.music = new Audio();
        this.audioElements.music.volume = this.volume;
        this.audioElements.music.loop = false;
        this.audioElements.music.addEventListener('ended', () => {
            this.nextTrack();
        });
        
        // SFX audio element
        this.audioElements.sfx = new Audio();
        this.audioElements.sfx.volume = this.sfxVolume;
        
        // Voice lines audio element  
        this.audioElements.voicelines = new Audio();
        this.audioElements.voicelines.volume = this.sfxVolume;
    }

    createJukeboxWidget() {
        // Remove existing jukebox if it exists
        const existingJukebox = document.getElementById('jukebox-widget');
        if (existingJukebox) {
            existingJukebox.remove();
        }

        const jukeboxWidget = document.createElement('div');
        jukeboxWidget.id = 'jukebox-widget';
        jukeboxWidget.className = 'jukebox-widget';
        jukeboxWidget.innerHTML = `
            <div class="jukebox-header">
                <img src="../images/jukebox.png" alt="Jukebox" class="jukebox-icon">
                <span class="jukebox-title">JUKEBOX</span>
                <div class="drag-handle" title="Drag to move">⋮⋮</div>
                <button id="jukebox-toggle" class="jukebox-toggle">−</button>
            </div>
            <div class="jukebox-content">
                <div class="track-info">
                    <div class="track-name" id="current-track-name">Loading...</div>
                    <div class="track-duration" id="track-duration">--:--</div>
                </div>
                <div class="jukebox-controls">
                    <button id="prev-track" class="control-btn">◀</button>
                    <button id="play-pause" class="control-btn play-btn">▶</button>
                    <button id="next-track" class="control-btn">▶▶</button>
                    <button id="stop-music" class="control-btn">⏹</button>
                </div>
                <div class="volume-control">
                    <label>Volume:</label>
                    <input type="range" id="volume-slider" min="0" max="100" value="70">
                </div>
                <div class="volume-control">
                    <label>Announcer:</label>
                    <input type="checkbox" id="announcer-mute-toggle"> Mute
                </div>
                <div class="track-list">
                    <div class="track-list-header">Playlist:</div>
                    <div id="track-list-content"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(jukeboxWidget);
        
        // Setup jukebox event handlers
        this.setupJukeboxHandlers();
        
        // Populate track list
        this.updateTrackList();
        
        // Update display
        this.updateJukeboxDisplay();
        
        // Set up jukebox toggle icon handler
        this.setupJukeboxToggleIcon();
    }

    setupJukeboxHandlers() {
        // Toggle jukebox visibility
        document.getElementById('jukebox-toggle').addEventListener('click', () => {
            this.toggleJukebox();
        });
        
        // Play/Pause button
        document.getElementById('play-pause').addEventListener('click', () => {
            this.togglePlayPause();
        });
        
        // Previous track
        document.getElementById('prev-track').addEventListener('click', () => {
            this.previousTrack();
        });
        
        // Next track
        document.getElementById('next-track').addEventListener('click', () => {
            this.nextTrack();
        });
        
        // Stop music
        document.getElementById('stop-music').addEventListener('click', () => {
            this.stopMusic();
        });
        
        // Volume control
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            this.setVolume(e.target.value / 100);
        });

        const annToggle = document.getElementById('announcer-mute-toggle');
        if (annToggle) {
            annToggle.addEventListener('change', (e) => {
                this.announcerMuted = !!e.target.checked;
            });
        }

        // Setup drag functionality
        this.setupJukeboxDrag();
    }

    setupJukeboxDrag() {
        const jukeboxWidget = document.getElementById('jukebox-widget');
        const jukeboxHeader = jukeboxWidget.querySelector('.jukebox-header');
        
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        // Mouse down on header starts dragging
        jukeboxHeader.addEventListener('mousedown', (e) => {
            // Don't start drag if clicking on the toggle button
            if (e.target.closest('.jukebox-toggle')) {
                return;
            }
            
            isDragging = true;
            const rect = jukeboxWidget.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            jukeboxWidget.classList.add('dragging');
            jukeboxHeader.classList.add('dragging');
            
            // Prevent text selection
            e.preventDefault();
        });
        
        // Mouse move updates position
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            
            // Keep widget within viewport bounds
            const rect = jukeboxWidget.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;
            
            const constrainedX = Math.max(0, Math.min(newX, maxX));
            const constrainedY = Math.max(0, Math.min(newY, maxY));
            
            jukeboxWidget.style.left = constrainedX + 'px';
            jukeboxWidget.style.top = constrainedY + 'px';
            jukeboxWidget.style.right = 'auto';
            jukeboxWidget.style.bottom = 'auto';
        });
        
        // Mouse up stops dragging
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                jukeboxWidget.classList.remove('dragging');
                jukeboxHeader.classList.remove('dragging');
            }
        });
        
        // Handle mouse leave to stop dragging if cursor leaves window
        document.addEventListener('mouseleave', () => {
            if (isDragging) {
                isDragging = false;
                jukeboxWidget.classList.remove('dragging');
                jukeboxHeader.classList.remove('dragging');
            }
        });
    }

    setupGlobalSoundHandlers() {
        // Add click sound to all buttons
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                this.playButtonSound();
            }
        });
        
        // Add sound to specific interactive elements
        document.addEventListener('change', (e) => {
            if (e.target.type === 'range' || e.target.type === 'checkbox') {
                this.playButtonSound();
            }
        });
    }

    loadTrack(index) {
        if (index >= 0 && index < this.musicLibrary.length) {
            this.currentTrack = index;
            const track = this.musicLibrary[index];
            this.audioElements.music.src = track.file;
            this.updateJukeboxDisplay();
        }
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.pauseMusic();
        } else {
            this.playMusic();
        }
    }

    playMusic() {
        if (this.audioElements.music.src) {
            // Try to enable autoplay if needed
            this.enableAudioContext();
            
            this.audioElements.music.play()
                .then(() => {
                    this.isPlaying = true;
                    this.updatePlayButton();
                    console.log('Music started playing:', this.musicLibrary[this.currentTrack].name);
                })
                .catch(error => {
                    console.error('Error playing music:', error);
                    // Try to load and play again
                    this.retryPlayback();
                });
        }
    }

    enableAudioContext() {
        // Create or resume audio context for browser autoplay policies
        if (typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }
    }

    retryPlayback() {
        // Retry loading and playing the track
        setTimeout(() => {
            const currentTrackData = this.musicLibrary[this.currentTrack];
            console.log('Retrying playback for:', currentTrackData.name);
            this.audioElements.music.load();
            this.audioElements.music.play()
                .then(() => {
                    this.isPlaying = true;
                    this.updatePlayButton();
                })
                .catch(error => {
                    console.error('Retry failed:', error);
                    alert('Unable to play audio. Please check that audio files are available and try clicking play again.');
                });
        }, 500);
    }

    pauseMusic() {
        this.audioElements.music.pause();
        this.isPlaying = false;
        this.updatePlayButton();
    }

    stopMusic() {
        this.audioElements.music.pause();
        this.audioElements.music.currentTime = 0;
        this.isPlaying = false;
        this.updatePlayButton();
    }

    nextTrack() {
        this.currentTrack = (this.currentTrack + 1) % this.musicLibrary.length;
        this.loadTrack(this.currentTrack);
        if (this.isPlaying) {
            this.playMusic();
        }
    }

    previousTrack() {
        this.currentTrack = this.currentTrack === 0 ? this.musicLibrary.length - 1 : this.currentTrack - 1;
        this.loadTrack(this.currentTrack);
        if (this.isPlaying) {
            this.playMusic();
        }
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audioElements.music.volume = this.volume;
        this.updateVolumeDisplay();
    }

    toggleJukebox() {
        const content = document.querySelector('.jukebox-content');
        const toggle = document.getElementById('jukebox-toggle');
        
        if (this.jukeboxVisible) {
            content.style.display = 'none';
            toggle.textContent = '+';
            this.jukeboxVisible = false;
        } else {
            content.style.display = 'block';
            toggle.textContent = '−';
            this.jukeboxVisible = true;
        }
    }

    updateJukeboxDisplay() {
        const track = this.musicLibrary[this.currentTrack];
        if (!track) return;
        
        const trackName = document.getElementById('current-track-name');
        const trackDuration = document.getElementById('track-duration');
        
        if (trackName) trackName.textContent = track.name;
        if (trackDuration) trackDuration.textContent = track.duration;
    }

    updatePlayButton() {
        const playButton = document.getElementById('play-pause');
        if (playButton) {
            playButton.textContent = this.isPlaying ? '⏸' : '▶';
            playButton.className = this.isPlaying ? 'control-btn pause-btn' : 'control-btn play-btn';
        }
    }

    updateVolumeDisplay() {
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = this.volume * 100;
        }
    }

    updateTrackList() {
        const trackListContent = document.getElementById('track-list-content');
        if (!trackListContent) return;
        
        trackListContent.innerHTML = this.musicLibrary.map((track, index) => `
            <div class="track-item ${index === this.currentTrack ? 'active' : ''}" 
                 onclick="audioSystem.selectTrack(${index})">
                <span class="track-number">${index + 1}.</span>
                <span class="track-title">${track.name}</span>
                <span class="track-time">${track.duration}</span>
            </div>
        `).join('');
    }

    selectTrack(index) {
        this.loadTrack(index);
        this.updateTrackList();
        if (this.isPlaying) {
            this.playMusic();
        }
    }

    setupJukeboxToggleIcon() {
        const toggleIcon = document.getElementById('jukebox-toggle-icon');
        if (toggleIcon) {
            toggleIcon.addEventListener('click', () => {
                this.toggleJukeboxWidget();
            });
        }
    }

    toggleJukeboxWidget() {
        const widget = document.getElementById('jukebox-widget');
        if (widget) {
            if (widget.style.display === 'none' || widget.style.display === '') {
                widget.style.display = 'block';
                widget.style.animation = 'fadeIn 0.3s ease-in-out';
            } else {
                widget.style.animation = 'fadeOut 0.3s ease-in-out';
                setTimeout(() => {
                    widget.style.display = 'none';
                }, 300);
            }
        }
    }

    // Sound Effect Methods
    playButtonSound() {
        this.playSoundEffect(this.soundLibrary.buttonPress);
    }

    playCheerSound() {
        this.playSoundEffect(this.soundLibrary.cheer);
    }

    playStartRaceSound() {
        this.playSoundEffect(this.soundLibrary.startRace);
    }

    playLockInSound() {
        this.playSoundEffect(this.soundLibrary.buttonPress); // Using button press for now
    }

    playSoundEffect(soundFile) {
        // Create new audio element for overlapping sounds
        const audio = new Audio(soundFile);
        audio.volume = this.sfxVolume;
        audio.play().catch(error => {
            console.error('Error playing sound:', error);
        });
    }

    // Voice Line Methods
    async playVoiceLine(category, lineName) {
        try {
            const voiceLineFile = `sounds/OHR_Voicelines/${category}/${lineName}.mp3`;
            this.audioElements.voicelines.src = voiceLineFile;
            await this.audioElements.voicelines.play();
        } catch (error) {
            console.error('Error playing voice line:', error);
        }
    }

    playRandomVoiceLine(category) {
        // This would need to be implemented with the voice line data structure
        console.log(`Playing random voice line from category: ${category}`);
    }

    // Integration Methods
    setGameEngine(gameEngine) {
        this.gameEngine = gameEngine;
    }

    // Public API
    getCurrentTrack() {
        return this.musicLibrary[this.currentTrack];
    }

    isCurrentlyPlaying() {
        return this.isPlaying;
    }

    getVolume() {
        return this.volume;
    }

    getSFXVolume() {
        return this.sfxVolume;
    }

    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.audioElements.sfx.volume = this.sfxVolume;
        this.audioElements.voicelines.volume = this.sfxVolume;
    }
}

// Global audio system instance
let audioSystem = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    audioSystem = new OHRAudioSystem();
    
    // Connect to game engine when both are ready
    if (window.gameEngine) {
        gameEngine.setAudioSystem(audioSystem);
        audioSystem.setGameEngine(gameEngine);
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OHRAudioSystem;
}