// static/race.js

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // FRONTEND LOGIC (race.js)
    // ==========================================================================
    // This script handles all the visual presentation of the game in the user's
    // browser. Its main jobs are:
    //
    // 1. VISUALS: Fetching game state from the server and translating each
    //    racer's linear position into (x, y) coordinates on the screen. This
    //    includes calculating a unique elliptical "lane" for each racer.
    // 2. USER INTERACTION: Handling clicks for the "Start" and "Cheer" buttons.
    // 3. SCOREBOARD: Displaying the final results when the race is over.
    // 
    // 
    /**
### How to Customize Your Track Path

The most important change is the `PATH_CONFIG` object in `static/race.js`. This is your new control panel for the visuals.

1.  **Open `static/race.js`**.
2.  **Find the `PATH_CONFIG` object** near the top of the file.
3.  **Adjust the values** as described in the comments to match your track background. For example:
    *   If the racers are running too high on the screen, increase `centerY` (e.g., from `0.62` to `0.65`).
    *   If the path is too wide for your track image, decrease `radiusX` (e.g., from `0.4` to `0.38`).
    *   If the back turn looks too wide compared to your image, decrease `perspectiveX` (e.g., from `0.85` to `0.75`) to "pinch" it horizontally.
4.  **Save the file and hard-refresh** your browser (Ctrl+Shift+R or Cmd+Shift+R) to see the changes instantly. You don't need to restart the Python server for these visual tweaks.

With this setup, you have full control over the visual presentation while keeping the backend race logic simple and robust.
*/

    // --- DOM Elements ---
    const startBtn = document.getElementById('start-race-btn');
    const track = document.getElementById('track');
    // ... (rest of DOM elements are the same)
    const eventLog = document.getElementById('event-log');
    const raceTimer = document.getElementById('race-timer');
    const lapCounter = document.getElementById('lap-counter');
    const cheerControls = document.getElementById('cheer-controls');
    const scoreboardContainer = document.getElementById('scoreboard-container');
    const scoreboard = document.getElementById('scoreboard');


    // --- Game State Variables ---
    let LAP_DISTANCE = 400;
    let TOTAL_LAPS = 4;
    const RACER_NAMES = ["Tracer", "Genji", "Lúcio", "Sojourn", "Widowmaker", "Reinhardt"];
    let gameStateInterval;

    // ==========================================================================
    // CUSTOMIZABLE TRACK PATH CONFIGURATION
    // ==========================================================================
    // Tweak the values in this object to perfectly align the racers' path
    // with your background image.
    // ==========================================================================
    const PATH_CONFIG = {
        // --- Root Ellipse Shape & Position (The center lane) ---
        centerX: 0.5,
        centerY: 0.62,
        radiusX: 0.42,
        radiusY: 0.35,

        // --- Perspective Adjustments ---
        verticalPerspective: 0.3,
        horizontalPerspective: 0.8,

        // --- Starting Position ---
        startAngle: Math.PI / 2,

        // ======================================================================
        // NEW: Lane Configuration
        // ======================================================================
        // This is the core of the multi-lane system.
        laneCount: 6,
        // This single value controls the distance between each racer's lane.
        // It's a percentage of the track's radius.
        // 0.05 means each lane is 5% wider/taller than the one inside it.
        // Tweak this value to make the racers more spread out or closer together.
        laneSpacingFactor: 0.06
    };

    /**
     * Calculates visual properties for a specific racer in a specific lane.
     * @param {number} linearPosition - The racer's total distance covered.
     * @param {object} trackDimensions - The dimensions of the track div.
     * @param {number} laneIndex - The index of the lane for this racer (e.g., -2.5 to 2.5).
     * @returns {object} An object with { x, y, scale, zIndex, angle }.
     */
    function calculateLanePosition(linearPosition, trackDimensions, laneIndex) {
        // 1. Calculate the base angle from the linear position.
        const lapPosition = linearPosition % LAP_DISTANCE;
        const angle = PATH_CONFIG.startAngle + (lapPosition / LAP_DISTANCE) * 2 * Math.PI;

        // 2. NEW: Calculate the radii for THIS SPECIFIC LANE.
        // We take the root radius and expand or shrink it based on the lane index
        // and the spacing factor. This creates the nested elliptical lanes.
        const spacingMultiplier = 1 + (laneIndex * PATH_CONFIG.laneSpacingFactor);
        const laneRadiusX = PATH_CONFIG.radiusX * spacingMultiplier;
        const laneRadiusY = PATH_CONFIG.radiusY * spacingMultiplier;

        // 3. Calculate the base (x, y) offsets on this specific lane's ellipse.
        const baseOffsetX = trackDimensions.width * laneRadiusX * Math.cos(angle);
        const baseOffsetY = trackDimensions.height * laneRadiusY * Math.sin(angle);

        // 4. Determine the perspective factor (0 at back, 1 at front).
        const perspectiveFactor = (Math.sin(angle) + 1) / 2;

        // 5. Apply perspective scaling to the offsets.
        const scale = PATH_CONFIG.verticalPerspective + (1 - PATH_CONFIG.verticalPerspective) * perspectiveFactor;
        const horizontalScale = PATH_CONFIG.horizontalPerspective + (1 - PATH_CONFIG.horizontalPerspective) * perspectiveFactor;
        const finalOffsetX = baseOffsetX * horizontalScale;
        const finalOffsetY = baseOffsetY * scale;

        // 6. Calculate the final on-screen coordinates.
        const x = (trackDimensions.width * PATH_CONFIG.centerX) + finalOffsetX;
        const y = (trackDimensions.height * PATH_CONFIG.centerY) + finalOffsetY;
        const zIndex = Math.round(y);

        return { x, y, scale, zIndex, angle };
    }

    /**
     * Fetches state from the server and updates all visuals on the page.
     */
    async function updateGameState() {
        try {
            const response = await fetch('/game_state');
            const data = await response.json();
            if (data.status === "error") return clearInterval(gameStateInterval);

            // ... (code for updating timers and laps is unchanged) ...
            if (data.race_distance) {
                LAP_DISTANCE = 400;
                TOTAL_LAPS = data.race_distance / LAP_DISTANCE;
            }
            const trackRect = track.getBoundingClientRect();
            raceTimer.textContent = `Race Time: ${data.race_clock.toFixed(2)}s`;
            const leadingPosition = Math.max(0, ...data.racers.map(r => r.position));
            const currentLap = Math.floor(leadingPosition / LAP_DISTANCE) + 1;
            lapCounter.textContent = `Lap: ${Math.min(currentLap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;


            // --- MODIFIED: Racer Update Loop with Lane Calculation ---
            data.racers.forEach((racer, index) => {
                const racerElement = document.getElementById(`racer-${racer.name}`);
                const spriteElement = document.getElementById(`sprite-${racer.name}`);

                // NEW: Calculate the centered lane index for this racer.
                // For 6 lanes (index 0-5), this creates indices: -2.5, -1.5, -0.5, 0.5, 1.5, 2.5
                const laneIndex = index - (PATH_CONFIG.laneCount - 1) / 2.0;

                // Pass the unique laneIndex to our positioning function.
                const newPos = calculateLanePosition(racer.position, trackRect, laneIndex);

                racerElement.style.left = `${newPos.x}px`;
                racerElement.style.top = `${newPos.y}px`;
                racerElement.style.transform = `translateX(-50%) translateY(-50%) scale(${newPos.scale})`;
                racerElement.style.zIndex = newPos.zIndex;

                // ... (rest of the loop is unchanged) ...
                if (Math.sin(newPos.angle) < 0) {
                    spriteElement.classList.add('flipped');
                } else {
                    spriteElement.classList.remove('flipped');
                }

                if (racer.finished) {
                    const cheerBtn = document.getElementById(`cheer-${racer.name}`);
                    if (cheerBtn) cheerBtn.disabled = true;
                }
            });

            // ... (event log and scoreboard logic is unchanged) ...
            data.events.forEach(event => {
                const p = document.createElement('p');
                const [type, message] = event.split(': ');
                p.textContent = message;
                p.className = `event-message ${type}`;
                eventLog.appendChild(p);
                eventLog.scrollTop = eventLog.scrollHeight;
            });

            if (data.status === 'finished') {
                clearInterval(gameStateInterval);
                displayScoreboard(data.racers);
            }
        } catch (error) {
            console.error("Failed to get game state:", error);
            clearInterval(gameStateInterval);
        }
    }

    // --- All other functions (displayScoreboard, setupInitialUI, etc.) are unchanged ---
    function displayScoreboard(racers) {
        scoreboardContainer.classList.remove('hidden');
        const finishedRacers = racers.filter(r => r.finished).sort((a, b) => a.finish_time - b.finish_time);
        finishedRacers.forEach((racer, index) => {
            const li = document.createElement('li');
            li.textContent = `#${index + 1}: ${racer.name} - ${racer.finish_time.toFixed(2)}s`;
            scoreboard.appendChild(li);
        });
    }

    function setupInitialUI() {
        RACER_NAMES.forEach((name) => {
            const racerDiv = document.createElement('div');
            racerDiv.className = 'racer';
            racerDiv.id = `racer-${name}`;
            racerDiv.innerHTML = `
                <div class="racer-sprite" id="sprite-${name}" style="background-image: url('/static/assets/horse.png');"></div>
                <div class="racer-name">${name}</div>
            `;
            track.appendChild(racerDiv);
            const cheerBtn = document.createElement('button');
            cheerBtn.id = `cheer-${name}`;
            cheerBtn.className = 'cheer-btn';
            cheerBtn.textContent = `Cheer ${name}`;
            cheerBtn.disabled = true;
            cheerBtn.addEventListener('click', () => cheerForRacer(name));
            cheerControls.appendChild(cheerBtn);
        });
        setTimeout(() => updateGameState(), 50);
    }

    async function startGame() {
        startBtn.disabled = true;
        const response = await fetch('/start_race', { method: 'POST' });
        const data = await response.json();
        if (response.ok) {
            document.querySelectorAll('.cheer-btn').forEach(btn => btn.disabled = false);
            gameStateInterval = setInterval(updateGameState, 100);
        } else {
            alert(`Error: ${data.message}`);
            startBtn.disabled = false;
        }
    }

    async function cheerForRacer(name) {
        await fetch(`/cheer/${name}`, { method: 'POST' });
    }

    startBtn.addEventListener('click', startGame);
    setupInitialUI();
});