#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function syncCharacterDb() {
  const src = path.resolve(__dirname, '..', 'main', 'character_database.json');
  const destDir = path.resolve(__dirname, '..', 'backend', 'src', 'data');
  const dest = path.join(destDir, 'character_database.json');
  if (!fs.existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const json = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dest, json, 'utf8');
  console.log(`Synced character database to ${dest}`);
}

try {
  syncCharacterDb();
} catch (e) {
  console.error(e);
  process.exit(1);
}


