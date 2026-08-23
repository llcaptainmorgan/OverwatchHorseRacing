#!/usr/bin/env node
/*
  OHR Generic Voiceline Templates Generator
  - Reads main/character_database.json
  - Produces sounds/OHR_Voicelines/voicelines.templates.json
  - Templates use placeholders: {A}, {B}, {ability}
  - Consumer should replace placeholders at runtime
*/

const fs = require('fs');
const path = require('path');

function loadCharacterDb() {
  const dbPath = path.resolve(__dirname, '..', 'main', 'character_database.json');
  const raw = fs.readFileSync(dbPath, 'utf8');
  return JSON.parse(raw);
}

function buildTemplates(db) {
  const characters = [];
  const abilities = {};
  const chars = db?.characters || {};
  for (const [id, c] of Object.entries(chars)) {
    if (!c) continue;
    // include all characters; consumers can decide availability
    const name = c.display_name || id;
    characters.push(name);
    const abilityName = c?.ability?.name || c?.ability?.id || 'Ability';
    abilities[id] = abilityName;
  }

  const suffixesGeneric = [
    'What a move!',
    'Look at that pace!',
    'The crowd goes wild!',
    'That might do it!',
    'Incredible acceleration!',
    'Momentum is shifting!',
  ];

  // Helper to set common rules
  const rules = (priority, { minGap = 2, maxGap = 20, interruptible = true, cooldown = 4 } = {}) => ({
    priority,
    min_gap_sec: minGap,
    max_gap_sec: maxGap,
    interruptible,
    cooldown_sec: cooldown,
  });

  const data = {
    meta: {
      generated_at: new Date().toISOString(),
      version: '1.1.0',
      source: 'tools/generate_voiceline_templates.js'
    },
    characters,
    abilities,
    placeholders: {
      A: 'Primary racer (e.g., overtaker / subject)',
      B: 'Secondary racer (e.g., overtaken)',
      ability: 'Ability name for the subject racer'
    },
    speakers: {
      generic: { prefix: '', suffix: '' },
      ana: { prefix: '[ana] ', suffix: '' },
      lifeweaver: { prefix: '[lifeweaver] ', suffix: '' }
    },
    events: {
      overtake: {
        templates: [
          '{A} overtakes {B}!',
          '{A} slips past {B}!',
          '{A} surges ahead of {B}!',
          '{A} edges in front of {B}!',
          '{A} flies by {B}!'
        ],
        suffixes: suffixesGeneric,
        rules: { ...rules(40), disallow_same_name: true },
        speaker_overrides: {
          ana: ['{A} moves with purpose past {B}!', '{A} shows experience against {B}.'],
          lifeweaver: ['{A} glides on by {B}!', 'Chic and swift from {A}!']
        }
      },
      ability_used: {
        templates: [
          '{A} just used {ability}!',
          '{A} activates {ability}!',
          '{A}\'s {ability} comes out!',
          '{A} pops {ability}!'
        ],
        suffixes: [ 'Look at them go!', 'That could be the difference!', 'Timing is everything.', 'Big momentum shift!' ],
        rules: rules(60),
        speaker_overrides: {
          ana: ['{A} calls upon {ability}.', 'Measured and timely from {A}.'],
          lifeweaver: ['{A} blossoms with {ability}!', 'Gorgeous execution by {A}!']
        }
      },
      lap_milestone: {
        templates: [ '{A} completes lap 1!', '{A} completes lap 2!', '{A} completes lap 3!' ],
        suffixes: [ 'Keeping steady.', 'Building momentum.', 'Setting up for the finish.' ],
        rules: rules(20),
      },
      anti_spam_warning: {
        templates: [
          'We have someone in the crowd cheering too loud!',
          'Easy on the cheering out there!',
          'Someone is overdoing it!'
        ],
        suffixes: [ 'Let the racers breathe!', 'Timing matters!' ],
        rules: rules(50, { minGap: 2, maxGap: 12 }),
        interrupter_followups: [ 'Hey! hey!', 'Hold on!', 'Shh!' ]
      },
      interrupt_shout: {
        templates: [ 'Oh my!', 'What a moment!', 'Unbelievable!', 'Hey! hey!', 'Hold on!', 'Shh!' ],
        suffixes: [],
        rules: rules(90, { minGap: 0, maxGap: 0, interruptible: true, cooldown: 0 })
      },
      race_finish: {
        templates: [ 'That\'s the flag!', 'It\'s over!', 'The race concludes!' ],
        suffixes: [ 'What a finish.', 'Drama to the end.' ],
        rules: rules(100, { minGap: 0, maxGap: 0, interruptible: true, cooldown: 0 })
      },
      race_win: {
        templates: [ '{A} takes the win!', '{A} claims victory!', '{A} stands on top!' ],
        suffixes: [ 'A commanding performance.', 'Well earned.' ],
        rules: rules(95, { minGap: 0, maxGap: 0, interruptible: true, cooldown: 0 })
      },
      storytime: {
        templates: [
          'Let me tell you a story...',
          'You know, once I saw a racer like {A}...',
          'There was a time when {A} tried a daring line...'
        ],
        suffixes: [],
        rules: rules(5, { minGap: 10, maxGap: 20, interruptible: false, cooldown: 15 })
      },
      banter: {
        templates: [
          'Ana, have you ever seen anything like this?',
          'Lifeweaver, don\'t get too excited now!',
          'We could do this all day, couldn\'t we?'
        ],
        suffixes: [],
        rules: rules(10, { minGap: 8, maxGap: 18, interruptible: false, cooldown: 12 })
      },
      map_commentary: {
        templates: [ 'A beautiful day on the track.', 'Conditions look perfect for a fast race.', 'Crowd energy is electric.' ],
        suffixes: [],
        rules: rules(8)
      },
      position_callout: {
        templates: [ '{A} is in 1st!', '{A} moves into 2nd!', '{A} holds 3rd place.', '{A} is battling in 4th.', '{A} sits in 5th.', '{A} is currently 6th.' ],
        suffixes: [ 'Still plenty of race left.', 'Pressure mounting behind.', 'They need to maintain rhythm.' ],
        rules: rules(15)
      }
    }
  };

  return data;
}

function main() {
  const db = loadCharacterDb();
  const templates = buildTemplates(db);
  const outDir = path.resolve(__dirname, '..', 'sounds', 'OHR_Voicelines');
  const outPath = path.join(outDir, 'voicelines.templates.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(templates, null, 2), 'utf8');
  console.log(`Generated ${outPath} with ${templates.characters.length} characters.`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e); process.exit(1); }
}


