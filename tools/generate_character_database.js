/**
 * Generate character_database.generated.json from roster image folders.
 * - Scans images/roster_images for *_roster.png
 * - Checks images/current_roster for available assets
 * - Builds entries with default schema (placeholders where unknown)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROSTER_DIR = path.join(ROOT, 'images', 'roster_images');
const CURRENT_DIR = path.join(ROOT, 'images', 'current_roster');
const OUTPUT = path.join(ROOT, 'main', 'character_database.generated.json');

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png'));
}

function toIdFromRoster(filename) {
  // Strip suffix like _roster.png and normalize
  const base = filename.replace(/_roster\.png$/i, '');
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toDisplayName(id) {
  const special = {
    soldier76: 'Soldier: 76',
    torbjorn: 'Torbjörn',
    lucio: 'Lúcio',
    dva: 'D.Va',
    mccree: 'Cassidy', // legacy
    cassidy: 'Cassidy',
    wreckingball: 'Wrecking Ball',
  };
  if (special[id]) return special[id];
  return id.replace(/\d+/g, m => ` ${m}`).replace(/(^|\s)\w/g, c => c.toUpperCase()).trim();
}

function guessRole(id) {
  // Minimal mapping; unknown defaults to "Unknown"
  const tanks = new Set(['reinhardt','orisa','ramattra','sigma','zarya','winston','wreckingball','roadhog','mauga','junkerqueen','dva', 'hazard', 'doomfist',]);
  const supports = new Set(['mercy','lucio','moira','baptiste','zenyatta','brigitte','kiriko','illari']); // removed ana and lifeweaver as they are annoiuncers, not characters.
  if (tanks.has(id)) return 'Tank';
  if (supports.has(id)) return 'Support';
  return 'Damage';
}

function hasFile(dir, name) { return fs.existsSync(path.join(dir, name)); }

function buildAssets(id) {
  // Prefer current_roster; fallback to roster_images
  const thumbCurrent = `${id}_roster.png`;
  const thumbRoster = `${id}_roster.png`;
  const sprite = [`${id}_sprite_small.png`, `${id}_small_sprite.png`].find(n => hasFile(CURRENT_DIR, n));
  const full = [`${id}_horse_full.png`, `${id}_Full.png`, `${capitalize(id)}_horse_full.png`, `${capitalize(id)}_Full.png`].find(n => hasFile(CURRENT_DIR, n));
  const thumbnail = hasFile(CURRENT_DIR, thumbCurrent)
    ? `../images/current_roster/${thumbCurrent}`
    : `../images/roster_images/${thumbRoster}`;
  return {
    thumbnail,
    portrait_large: full ? `../images/current_roster/${full}` : null,
    racing_sprite: sprite ? `../images/current_roster/${sprite}` : null,
  };
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function main() {
  const rosterPngs = listPngs(ROSTER_DIR).filter(f => /_roster\.png$/i.test(f));
  const ids = Array.from(new Set(rosterPngs.map(toIdFromRoster)));
  const characters = {};
  ids.forEach(id => {
    const assets = buildAssets(id);
    characters[id] = {
      id,
      display_name: toDisplayName(id),
      role: guessRole(id),
      stats: { speed: 70, power: 70, stamina: 70, determination: 70 },
      racer_style: 'pace_chaser',
      ability: {
        id: `${id}_ability`,
        name: 'Ability',
        description: 'To be defined',
        cooldown_sec: 12,
        effects: { speed_add: 0, power_add: 0, stamina_add: 0, position_add: 0 }
      },
      voice: {
        ability_voiceline_path: `../sounds/OHR_Voicelines/abilities/${id}_ability.wav`,
        victory_voiceline_path: `../sounds/OHR_Voicelines/finish/${id}_victory.wav`
      },
      assets,
      available: Boolean(assets.racing_sprite && assets.portrait_large && assets.thumbnail)
    };
  });

  const out = {
    roster_info: {
      active_characters: 6,
      total_available: ids.length,
      last_updated: new Date().toISOString().slice(0,10),
      version: 'generated'
    },
    characters,
    racing_mechanics: {
      base_stats: { speed: 70, power: 70, stamina: 70 },
      race_settings: { track_distance: 1600, lap_distance: 400, total_laps: 4, intermission_duration: 180 },
      cheer_rules: { cooldown_min_sec: 10, cooldown_max_sec: 16, anti_spam_window_sec: 5, anti_spam_threshold: 3 }
    }
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`Generated ${OUTPUT} with ${ids.length} characters.`);
}

main();


