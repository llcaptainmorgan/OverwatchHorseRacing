#!/usr/bin/env node
/**
 * One-shot: PUT guild /race on BlurpBlurps, Head Pat Enthusiasts, The Fireteam.
 * Reads token + app id from env, backend/.dev.vars, or repo-root .env (TOKENforOHR).
 * Never prints secret values.
 *
 *   node backend/scripts/register_discord_commands.js
 */
const fs = require('fs');
const path = require('path');

const GUILDS = [
  { name: 'BlurpBlurps', id: '1540521473004019742' },
  { name: 'Head Pat Enthusiasts', id: '1231421702186078258' },
  { name: 'The Fireteam', id: '878867762993324083' },
];

const COMMANDS = [
  {
    name: 'race',
    description: 'Create an Overwatch Horse Racing lobby and post the join link',
    type: 1,
  },
];

function loadDevVars(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

async function main() {
  const varsPath = path.join(__dirname, '..', '.dev.vars');
  const rootEnvPath = path.join(__dirname, '..', '..', '.env');
  const fileVars = {
    ...loadDevVars(rootEnvPath),
    ...loadDevVars(varsPath),
  };
  const token = process.env.DISCORD_BOT_TOKEN
    || fileVars.DISCORD_BOT_TOKEN
    || fileVars.TOKENforOHR
    || fileVars.TOKENforOGR;
  const appId = process.env.DISCORD_CLIENT_ID
    || fileVars.DISCORD_CLIENT_ID
    || fileVars.DISCORD_APPLICATION_ID
    || '1402766829117640704';
  if (!token || !appId) {
    console.error('Missing bot token or DISCORD_CLIENT_ID (env, backend/.dev.vars, or root .env TOKENforOHR).');
    process.exit(1);
  }

  for (const guild of GUILDS) {
    const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guild.id}/commands`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(COMMANDS),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`FAIL ${guild.name} (${guild.id}) HTTP ${resp.status}: ${text.slice(0, 400)}`);
      process.exit(1);
    }
    let names = '';
    try {
      names = JSON.parse(text).map((c) => c.name).join(', ');
    } catch {
      names = '(ok)';
    }
    console.log(`OK ${guild.name} (${guild.id}) commands: ${names}`);
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
