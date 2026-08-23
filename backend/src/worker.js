// ################################################################################
// # Worker Entry (HTTP Router)
// #
// # Routes:
// # - POST /sessions: create session and return session code
// # - GET  /settings: expose race settings to client
// # - GET  /characters: expose character database to client
// # - /sessions/:code/*: proxy to Durable Object for stateful operations
// ################################################################################
import { RACE_SETTINGS } from './config/settings.js';
import characterDatabase from './data/character_database.json' assert { type: 'json' };
import { SessionDO, safeJson } from './routes/session_routes.js';

export { SessionDO };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), env, request);
    }

    // ---- Discord OAuth routes ----
    if (url.pathname === '/auth/discord/login' && request.method === 'GET') {
      return await discordLogin(url, env);
    }
    if (url.pathname === '/auth/discord/callback' && request.method === 'GET') {
      return await discordCallback(url, env);
    }
    if (url.pathname === '/auth/me' && request.method === 'GET') {
      return await authMe(request, env);
    }
    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      return await authLogout(request, env);
    }
    if (url.pathname === '/auth/dev-guest' && request.method === 'POST') {
      return await authDevGuest(request, env);
    }

    // Route by session code as the DO id: /sessions/ABCD/...
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'sessions' && parts[1]) {
      const sessionCode = parts[1].toUpperCase();
      const id = env.SESSION_DO.idFromName(sessionCode);
      const stub = env.SESSION_DO.get(id);
      const pathRemainder = parts.slice(2).join('/');
      const newUrl = new URL(request.url);
      newUrl.pathname = `/${pathRemainder}`;
      const res = await stub.fetch(newUrl.toString(), request);
      // Don't wrap WS upgrade responses; return as-is for status 101
      if (res.status === 101) return res;
      return cors(res, env, request);
    }

    // Create session endpoint: POST /sessions
    if (request.method === 'POST' && url.pathname === '/sessions') {
      const sessionCode = generateCode();
      const id = env.SESSION_DO.idFromName(sessionCode);
      const stub = env.SESSION_DO.get(id);
      await stub.fetch(new URL('/state', request.url)); // warm up instance
      return cors(Response.json({ sessionCode, settings: RACE_SETTINGS }), env, request);
    }

    // Expose settings and characters for frontend
    if (request.method === 'GET' && url.pathname === '/settings') {
      return cors(Response.json(RACE_SETTINGS), env, request);
    }
    if (request.method === 'GET' && url.pathname === '/characters') {
      return cors(Response.json(characterDatabase), env, request);
    }

    return cors(new Response('OK'), env, request);
  }
};

function generateCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// =====================
// Discord OAuth helpers
// =====================
async function discordLogin(url, env) {
  const clientId = env.DISCORD_CLIENT_ID;
  const redirectUri = env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) return new Response('OAuth not configured', { status: 500 });

  const slot = url.searchParams.get('slot') || '';
  const ret = url.searchParams.get('return') || '';
  const state = base64urlEncode(JSON.stringify({ slot, ret }));
  const scope = 'identify';
  const authorize = new URL('https://discord.com/api/oauth2/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', scope);
  authorize.searchParams.set('state', state);
  return Response.redirect(authorize.toString(), 302);
}

async function discordCallback(url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  if (!code) return new Response('Missing code', { status: 400 });

  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const redirectUri = env.DISCORD_REDIRECT_URI;
  const jwtSecret = env.SESSION_JWT_SECRET;
  if (!clientId || !clientSecret || !redirectUri || !jwtSecret) return new Response('OAuth not configured', { status: 500 });

  // Exchange code for token
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!tokenResp.ok) {
    const txt = await tokenResp.text().catch(() => '');
    const headers = new Headers({ Location: `${url.origin}/main/index.html?oauth_error=${encodeURIComponent('token_exchange_failed')}` });
    return new Response(null, { status: 302, headers });
  }
  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) return new Response('No access token', { status: 502 });

  // Fetch user
  const meResp = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!meResp.ok) {
    const txt = await meResp.text().catch(() => '');
    const headers = new Headers({ Location: `${url.origin}/main/index.html?oauth_error=${encodeURIComponent('user_fetch_failed')}` });
    return new Response(null, { status: 302, headers });
  }
  const me = await meResp.json();
  const user = {
    discordId: me.id,
    username: me.username + (me.discriminator && me.discriminator !== '0' ? `#${me.discriminator}` : ''),
    avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null
  };

  // Create JWT session cookie
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 7; // 7 days
  const token = await signJwt({ sub: user.discordId, user, iat: now, exp }, jwtSecret);

  // Parse redirect return
  let ret = '';
  try { ret = JSON.parse(base64urlDecode(state) || '{}')?.ret || ''; } catch {}
  const redirectTarget = ret && isSafeReturnUrl(ret, env) ? ret : `${url.origin}/main/index.html`;

  const headers = new Headers({ Location: redirectTarget });
  const cookie = serializeCookie('ohr_session', token, { ...authCookieOpts(url), maxAge: 60 * 60 * 24 * 7 });
  headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

async function authMe(request, env) {
  const jwtSecret = env.SESSION_JWT_SECRET;
  if (!jwtSecret) return corsJson({ error: 'Not configured' }, 500, env, request);
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = parseCookie(cookieHeader)['ohr_session'] || '';
  if (!token) return corsJson({ user: null }, 200, env, request);
  try {
    const payload = await verifyJwt(token, jwtSecret);
    return corsJson({ user: payload.user || null }, 200, env, request);
  } catch {
    return corsJson({ user: null }, 200, env, request);
  }
}

async function authDevGuest(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!isLocalDevOrigin(origin)) {
    return corsJson({ error: 'Dev guest only allowed from localhost' }, 403, env, request);
  }
  const jwtSecret = env.SESSION_JWT_SECRET;
  if (!jwtSecret) return corsJson({ error: 'Not configured' }, 500, env, request);

  const user = { discordId: 'dev-guest', username: 'Dev Guest', avatar: null };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 7;
  const token = await signJwt({ sub: 'dev-guest', user, iat: now, exp }, jwtSecret);

  const url = new URL(request.url);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  applyCorsHeaders(headers, env, request);
  headers.append('Set-Cookie', serializeCookie('ohr_session', token, {
    ...authCookieOpts(url),
    maxAge: 60 * 60 * 24 * 7,
  }));
  return new Response(JSON.stringify({ user }), { status: 200, headers });
}

async function authLogout(request, env) {
  const url = new URL(request.url);
  const headers = new Headers();
  applyCorsHeaders(headers, env, request);
  headers.append('Set-Cookie', serializeCookie('ohr_session', '', { ...authCookieOpts(url), maxAge: 0 }));
  return new Response('OK', { status: 200, headers });
}

function isLocalDevOrigin(origin) {
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  } catch {
    return false;
  }
}

function isGitHubPagesOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    return u.hostname === 'github.io' || u.hostname.endsWith('.github.io');
  } catch {
    return false;
  }
}

function isAllowedBrowserOrigin(origin, env) {
  if (!origin) return false;
  if (isLocalDevOrigin(origin)) return true;
  if (isGitHubPagesOrigin(origin)) return true;
  const configured = (env?.ALLOWED_ORIGIN || '').trim();
  if (configured && configured !== '*' && origin === configured) return true;
  return false;
}

function resolveCorsOrigin(request, env) {
  const origin = request?.headers?.get?.('Origin') || '';
  if (origin && isAllowedBrowserOrigin(origin, env)) return origin;
  const configured = (env?.ALLOWED_ORIGIN || '').trim();
  if (configured && configured !== '*') return configured;
  return origin || 'http://127.0.0.1:8081';
}

function applyCorsHeaders(headers, env, request) {
  headers.set('Access-Control-Allow-Origin', resolveCorsOrigin(request, env));
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
}

function isSafeReturnUrl(ret, env) {
  try {
    const u = new URL(ret);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isAllowedBrowserOrigin(u.origin, env);
  } catch {
    return false;
  }
}

function authCookieOpts(url) {
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  return {
    httpOnly: true,
    path: '/',
    secure: local ? url.protocol === 'https:' : true,
    sameSite: local ? 'Lax' : 'None',
  };
}

function parseCookie(header) {
  const out = {};
  header.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx > -1) out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

function base64urlEncode(str) {
  let out = btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncodeBytes(bytes) {
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(b64url) {
  const pad = b64url.length % 4 === 2 ? '==' : b64url.length % 4 === 3 ? '=' : '';
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encHeader = base64urlEncode(JSON.stringify(header));
  const encPayload = base64urlEncode(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sig = base64urlEncodeBytes(new Uint8Array(sigBuf));
  return `${data}.${sig}`;
}

async function verifyJwt(token, secret) {
  const [encHeader, encPayload, sig] = token.split('.');
  if (!encHeader || !encPayload || !sig) throw new Error('bad token');
  const data = `${encHeader}.${encPayload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const expectedBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const expected = base64urlEncodeBytes(new Uint8Array(expectedBuf));
  if (expected !== sig) throw new Error('sig');
  const payload = JSON.parse(base64urlDecode(encPayload));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('exp');
  return payload;
}

function corsJson(obj, status, env, request) {
  const body = JSON.stringify(obj);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  applyCorsHeaders(headers, env, request);
  return new Response(body, { status, headers });
}

function cors(response, env, request) {
  const headers = new Headers(response.headers);
  applyCorsHeaders(headers, env, request);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}


