/**
 * UI Configuration for Overwatch Horse Racing
 * Easy manipulation of interface dimensions and layout
 */

const UI_CONFIG = {
    // === CHARACTER SELECTION INTERFACE ===
    characterSelection: {
        // Grid layout for character roster
        gridHeight: '180px',                    // Height of the character grid at bottom
        gridPadding: '20px',                    // Padding around the grid
        characterIconSize: '80px',              // Size of each character icon in grid
        characterIconSpacing: '10px',           // Space between character icons
        charactersPerRow: 8,                    // How many characters per row

        // Central character display
        centralDisplayHeight: '400px',          // Height of the main character display area
        characterImageMaxHeight: '350px',       // Max height of the large character image
        characterImageMaxWidth: '300px',        // Max width of the large character image
        
        // Stats panel
        statsWidth: '250px',                    // Width of the stats panel
        statBarHeight: '20px',                  // Height of each stat bar
        statSpacing: '15px',                    // Space between stats

        // Lock In button
        lockInButtonWidth: '200px',             // Width of the Lock In button
        lockInButtonHeight: '50px',             // Height of the Lock In button
        lockInButtonMarginTop: '30px',          // Space above the Lock In button

        // Animation timings
        hoverTransition: '0.3s',                // Transition time for hover effects
        selectionTransition: '0.4s',           // Transition time for character selection
    },

    // === DISCORD USER PANELS ===
    userPanels: {
        // Panel dimensions
        panelWidth: '160px',                    // Width of each Discord user panel
        panelHeight: '120px',                   // Height of each Discord user panel
        panelSpacing: '15px',                   // Space between panels
        panelBottomMargin: '20px',              // Distance from bottom of screen

        // Content sizing
        profileImageSize: '40px',               // Size of Discord profile images
        usernameMaxWidth: '140px',              // Max width for username text
        buttonHeight: '35px',                   // Height of CHEER/CHOOSE buttons
        
        // Plus sign for empty panels
        plusSignSize: '40px',                   // Size of the plus sign icon
        plusSignColor: '#ff7f22',               // Color of the plus sign

        // Panel styling
        borderRadius: '8px',                    // Border radius for panels
        backgroundColor: 'rgba(252, 199, 219, 0.8)', // Background color
        borderColor: '#fcc7db',                 // Border color
    },

    // === LAYOUT POSITIONS ===
    layout: {
        // Character selection positioning
        characterGridBottom: '20px',            // Distance from bottom for character grid
        centralDisplayCenterY: '50%',           // Vertical center position for main display
        
        // User panels positioning
        userPanelsContainer: {
            bottom: '20px',                     // Distance from bottom
            left: '50%',                        // Horizontal center reference
            transform: 'translateX(-50%)',      // Center alignment transform
        }
    },

    // === COLORS AND STYLING ===
    colors: {
        // Character selection
        selectedCharacterBorder: '#ff7f22',     // Border color for selected character
        unavailableCharacterOpacity: '0.4',    // Opacity for grayed out characters
        statBarFillColor: '#ff7f22',            // Color of stat bars
        statBarBackgroundColor: 'rgba(255, 255, 255, 0.2)', // Background of stat bars

        // User panels
        activePanelGlow: 'rgba(255, 127, 34, 0.6)', // Glow effect for active panels
        inactivePanelOpacity: '0.7',            // Opacity for inactive panels
    },

    // === GAME STATE STYLING ===
    gameState: {
        // Button states during different game phases
        intermissionButtonStyle: {
            backgroundColor: '#2ecc71',          // Green for CHOOSE button
            hoverColor: '#27ae60',
        },
        racingButtonStyle: {
            backgroundColor: '#e74c3c',          // Red for CHEER button
            hoverColor: '#c0392b',
        },
        disabledButtonStyle: {
            backgroundColor: '#7f8c8d',          // Gray for disabled buttons
            opacity: '0.5',
        }
    },

    // === TRACK PATH (visual SoT — oval, start column, backstretch) ===
    // Edit THIS object for ellipse mapping. Server race rules live in
    // shared/race_settings.js and do not override these knobs.
    trackPath: {
        centerX: 0.5,                // horizontal center (0..1)
        centerY: 0.62,               // vertical center (0..1)
        radiusX: 0.42,               // base horizontal radius (0..1 of width)
        radiusY: 0.35,               // base vertical radius (0..1 of height)
        horizontalPerspective: 0.8,  // extra scale for width
        verticalPerspective: 0.5,    // extra scale for height
        startAngle: Math.PI / 2,     // radians; Math.PI/2 places start at bottom
        columnSpacing: 2,            // pixels between racers in the start column (down from the start point)
        laneSpacing: 0.05,           // concentric radius step so 6 lanes stay visually separate
        columnHoldLapFrac: 0.25,     // hold column until first bend (~1/4 lap)
        columnFadeStartLapFrac: 0.18, // start merging onto lanes before the bend
        columnShiftY: 40,            // pixels to drop the whole start line (positive = down)
        backstretchLift: 0.15        // stretch far/back of oval upward (0 = none, 0.5 = 50% taller back)
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI_CONFIG;
} else {
    window.UI_CONFIG = UI_CONFIG;
} 