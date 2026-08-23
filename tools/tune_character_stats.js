#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'main', 'character_database.json');
const BACKEND_DEST = path.join(ROOT, 'backend', 'src', 'data', 'character_database.json');

function loadDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function clamp(v, min=1, max=99) { return Math.max(min, Math.min(max, Math.round(v))); }

function applyRoleDefaults(role) {
  switch ((role || '').toLowerCase()) {
    case 'tank':
      return { speed: 62, power: 86, stamina: 88, determination: 82 };
    case 'support':
      return { speed: 70, power: 68, stamina: 86, determination: 72 };
    default: // damage
      return { speed: 82, power: 72, stamina: 74, determination: 68 };
  }
}

function applyOverrides(id, displayName, role, s) {
  const idn = (id || '').toLowerCase();
  const name = (displayName || id).toLowerCase();
  const is = (v) => name.includes(v) || idn.includes(v);

  // Tanks (named)
  if (is('reinhardt')) s = { speed: 58, power: 92, stamina: 92, determination: 90 };
  if (is('orisa')) s = { speed: 62, power: 88, stamina: 90, determination: 88 };
  if (is('ramattra')) s = { speed: 64, power: 90, stamina: 88, determination: 88 };
  if (is('sigma')) s = { speed: 64, power: 86, stamina: 86, determination: 84 };
  if (is('zarya')) s = { speed: 66, power: 88, stamina: 86, determination: 82 };
  if (is('winston')) s = { speed: 70, power: 84, stamina: 88, determination: 80 };
  if (is('wrecking') || is('wreckingball')) s = { speed: 80, power: 80, stamina: 86, determination: 78 };
  if (is('roadhog')) s = { speed: 58, power: 90, stamina: 90, determination: 80 };
  if (is('mauga')) s = { speed: 60, power: 90, stamina: 90, determination: 82 };
  if (is('junker') || is('junkerqueen')) s = { speed: 70, power: 86, stamina: 84, determination: 82 };
  if (is('d.va') || idn === 'dva' || is('dva')) s = { speed: 76, power: 84, stamina: 88, determination: 80 };

  // Supports
  if (is('lucio') || is('lúcio')) s = { speed: 90, power: 65, stamina: 92, determination: 72 };
  if (is('zenyatta')) s = { speed: 55, power: 80, stamina: 88, determination: 75 };
  if (is('mercy')) s = { speed: 78, power: 60, stamina: 88, determination: 70 };
  if (is('moira')) s = { speed: 80, power: 68, stamina: 86, determination: 72 };
  if (is('ana')) s = { speed: 68, power: 70, stamina: 84, determination: 78 };
  if (is('baptiste')) s = { speed: 72, power: 72, stamina: 86, determination: 74 };
  if (is('kiriko') || is('kirko')) s = { speed: 84, power: 68, stamina: 82, determination: 72 };
  if (is('lifeweaver')) s = { speed: 70, power: 66, stamina: 86, determination: 70 };
  if (is('illari')) s = { speed: 76, power: 72, stamina: 84, determination: 74 };
  if (is('brigitte') || is('brigette')) s = { speed: 68, power: 82, stamina: 88, determination: 80 };

  // Damage
  if (is('tracer')) s = { speed: 95, power: 60, stamina: 78, determination: 70 };
  if (is('genji')) s = { speed: 90, power: 68, stamina: 80, determination: 72 };
  if (is('soldier: 76') || is('soldier76') || is('soldier 76')) s = { speed: 82, power: 72, stamina: 80, determination: 70 };
  if (is('sojourn')) s = { speed: 86, power: 78, stamina: 78, determination: 72 };
  if (is('ashe')) s = { speed: 78, power: 80, stamina: 76, determination: 72 };
  if (is('cassidy') || is('mccree')) s = { speed: 72, power: 82, stamina: 74, determination: 72 };
  if (is('hanzo')) s = { speed: 70, power: 84, stamina: 76, determination: 74 };
  if (is('widowmaker')) s = { speed: 70, power: 82, stamina: 74, determination: 72 };
  if (is('sombra')) s = { speed: 84, power: 68, stamina: 76, determination: 70 };
  if (is('reaper')) s = { speed: 74, power: 84, stamina: 84, determination: 76 };
  if (is('pharah')) s = { speed: 80, power: 78, stamina: 82, determination: 74 };
  if (is('echo')) s = { speed: 86, power: 76, stamina: 78, determination: 72 };
  if (is('bastion')) s = { speed: 60, power: 88, stamina: 86, determination: 70 };
  if (is('junkrat')) s = { speed: 76, power: 80, stamina: 78, determination: 70 };
  if (is('torbj') || is('torbjorn')) s = { speed: 68, power: 82, stamina: 78, determination: 72 };
  if (is('symmetra')) s = { speed: 68, power: 82, stamina: 80, determination: 72 };
  if (is('mei')) s = { speed: 66, power: 78, stamina: 84, determination: 74 };
  if (is('doomfist')) s = { speed: 84, power: 88, stamina: 80, determination: 76 };

  // Fictional/new (defaults to damage-like)
  const defaultsDamage = { speed: 80, power: 76, stamina: 78, determination: 72 };
  if (is('venture')) s = defaultsDamage;
  if (is('hazard')) s = defaultsDamage;
  if (is('freja')) s = defaultsDamage;
  if (is('wuyang')) s = defaultsDamage;
  if (is('juno')) s = defaultsDamage;

  return Object.fromEntries(Object.entries(s).map(([k,v]) => [k, clamp(v)]));
}

function tune() {
  const db = loadDb();
  const chars = db.characters || {};
  for (const [id, c] of Object.entries(chars)) {
    const base = applyRoleDefaults(c.role || 'Damage');
    let tuned = { ...base };
    tuned = applyOverrides(id, c.display_name, c.role, tuned);
    c.stats = { ...c.stats, ...tuned };
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  fs.mkdirSync(path.dirname(BACKEND_DEST), { recursive: true });
  fs.writeFileSync(BACKEND_DEST, JSON.stringify(db, null, 2), 'utf8');
  console.log('Tuned stats written to main and backend character_database.json');
}

try { tune(); } catch (e) { console.error(e); process.exit(1); }
