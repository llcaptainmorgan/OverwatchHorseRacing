// Discord HTTP Interactions: Ed25519 verify + /race lobby mint.
// Docs: https://discord.com/developers/docs/interactions/receiving-and-responding

const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const EPHEMERAL = 1 << 6;

export async function handleDiscordInteractions(request, env, mintSession) {
  // Browser / portal probes are GET. Discord's real handshake is POST + Ed25519.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = JSON.stringify({ ok: true, service: 'ohr-discord-interactions' });
    return new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const publicKey = String(env.DISCORD_PUBLIC_KEY || env.DISCORD_PUBLIC_KEY || '').trim();
  // Official Discord Worker tutorial: x-signature-ed25519 + x-signature-timestamp
  const signature = request.headers.get('x-signature-ed25519') || '';
  const timestamp = request.headers.get('x-signature-timestamp') || '';
  const body = await request.text();

  const ok = publicKey && await verifyDiscordSignature(publicKey, signature, timestamp, body);
  if (!ok) return new Response('invalid request signature', { status: 401 });

  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (interaction.type === PING) {
    return json({ type: PONG });
  }

  if (interaction.type !== APPLICATION_COMMAND) {
    return json({
      type: CHANNEL_MESSAGE,
      data: { content: 'Unsupported interaction.', flags: EPHEMERAL },
    });
  }

  const guildId = String(interaction.guild_id || '');
  if (!isAllowedGuild(guildId, env)) {
    return json({
      type: CHANNEL_MESSAGE,
      data: { content: 'This command is not enabled in this server.', flags: EPHEMERAL },
    });
  }

  const name = String(interaction.data?.name || '').toLowerCase();
  if (name !== 'race') {
    return json({
      type: CHANNEL_MESSAGE,
      data: { content: `Unknown command: ${name || '(none)'}`, flags: EPHEMERAL },
    });
  }

  const sessionCode = await mintSession();
  const joinUrl = buildPlayUrl(env, sessionCode);
  return json({
    type: CHANNEL_MESSAGE,
    data: {
      content: `Overwatch Horse Racing lobby **${sessionCode}**\n${joinUrl}`,
    },
  });
}

function isAllowedGuild(guildId, env) {
  if (!guildId) return false;
  const raw = String(env.ALLOWED_GUILD_IDS || env.ALLOWED_GUILD_IDS || '');
  const allowed = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  return allowed.includes(guildId);
}

function buildPlayUrl(env, sessionCode) {
  const fallback = 'https://llcaptainmorgan.github.io/OverwatchHorseRacing/main/';
  let base = String(env.FRONTEND_PLAY_URL || env.FRONTEND_PLAY_URL || fallback).trim() || fallback;
  try {
    const url = new URL(base);
    url.searchParams.set('session', sessionCode);
    return url.toString();
  } catch {
    const slash = base.endsWith('/') ? base : `${base}/`;
    return `${slash}?session=${encodeURIComponent(sessionCode)}`;
  }
}

async function verifyDiscordSignature(publicKeyHex, signatureHex, timestamp, body) {
  try {
    const keyBytes = hexToBytes(publicKeyHex);
    const sigBytes = hexToBytes(signatureHex);
    if (!keyBytes || !sigBytes || keyBytes.length !== 32 || sigBytes.length !== 64) return false;
    if (!timestamp) return false;
    const algo = { name: 'Ed25519' };
    const key = await crypto.subtle.importKey('raw', keyBytes, algo, false, ['verify']);
    const message = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify(algo, key, sigBytes, message);
  } catch {
    return false;
  }
}

function hexToBytes(hex) {
  const s = String(hex || '').trim();
  if (!s || s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
