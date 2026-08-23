(function() {
  function readQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }
  function writeQueryParam(name, value) {
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.replaceState({}, '', url.toString());
  }

  class BackendClient {
    constructor(config) {
      this.baseUrl = (config && config.backendBaseUrl) || '';
      this.sessionCode = null;
      this.socket = null;
    }

    async ensureSession() {
      if (!this.baseUrl || this.baseUrl.includes('REPLACE_WITH')) return null;
      const existing = readQueryParam('session');
      if (existing) { this.sessionCode = existing; return existing; }
      const resp = await fetch(`${this.baseUrl}/sessions`, { method: 'POST', credentials: 'include' });
      const data = await resp.json();
      this.sessionCode = data.sessionCode;
      writeQueryParam('session', this.sessionCode);
      return this.sessionCode;
    }

    get sessionUrl() {
      if (!this.sessionCode) throw new Error('No session');
      return `${this.baseUrl}/sessions/${this.sessionCode}`;
    }

    getSessionInviteUrl(code) {
      const session = String(code || this.sessionCode || readQueryParam('session') || '').trim().toUpperCase();
      const loc = new URL(window.location.href);
      const invite = new URL(loc.pathname, loc.origin);
      if (session) invite.searchParams.set('session', session);
      return invite.toString();
    }

    async copySessionInvite(code) {
      const url = this.getSessionInviteUrl(code);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          return { ok: true, url };
        }
      } catch {}
      try { window.prompt('Copy invite URL', url); } catch {}
      return { ok: false, url };
    }

    async getSettings() {
      const r = await fetch(`${this.baseUrl}/settings`);
      return r.json();
    }

    async getCharacters() {
      const r = await fetch(`${this.baseUrl}/characters`);
      return r.json();
    }

    async getState() {
      const r = await fetch(`${this.sessionUrl}/state`);
      return r.json();
    }

    stream(onMessage) {
      // Close any prior socket so we never hold two live /stream connections
      // (orphaned sockets can deliver stale empty players maps and flicker panels).
      if (this.socket) {
        try {
          this.socket.onmessage = null;
          this.socket.onopen = null;
          this.socket.onclose = null;
          this.socket.onerror = null;
          this.socket.close();
        } catch {}
        this.socket = null;
      }
      // Convert http:// to ws:// and https:// to wss://
      const wsUrl = this.sessionUrl.replace(/^https?:\/\//, (match) => {
        return match === 'https://' ? 'wss://' : 'ws://';
      }) + '/stream';
      const ws = new WebSocket(wsUrl);
      let pingTimer = null;
      ws.onmessage = (evt) => {
        try { const msg = JSON.parse(evt.data); onMessage && onMessage(msg); } catch {}
      };
      ws.onopen = () => {
        // send periodic heartbeat to keep presence active
        pingTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch {}
        }, 25000);
      };
      ws.onclose = () => {
        if (pingTimer) { try { clearInterval(pingTimer); } catch {} pingTimer = null; }
      };
      this.socket = ws;
      return ws;
    }

    async startRace() {
      const r = await fetch(`${this.sessionUrl}/start_race`, { method: 'POST' });
      return r.json();
    }

    async join(userId, username, preferredSlot, avatar) {
      const r = await fetch(`${this.sessionUrl}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, username, preferredSlot, avatar }) });
      return r.json();
    }

    async leave(userId) {
      const r = await fetch(`${this.sessionUrl}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      return r.json();
    }

    async selectCharacter(userId, characterId) {
      const r = await fetch(`${this.sessionUrl}/select_character`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, characterId }) });
      return r.json();
    }

    async lockIn(userId) {
      const r = await fetch(`${this.sessionUrl}/lock_in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      return r.json();
    }

    async cheer(userId, racerName) {
      const r = await fetch(`${this.sessionUrl}/cheer/${encodeURIComponent(racerName)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      return r.json();
    }

    async logout() {
      if (!this.baseUrl || this.baseUrl.includes('REPLACE_WITH')) return { status: 'noop' };
      const r = await fetch(`${this.baseUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
      try { this.sessionCode = null; } catch {}
      return { status: r.ok ? 'success' : 'error' };
    }

    async devGuestLogin() {
      if (!this.baseUrl || this.baseUrl.includes('REPLACE_WITH')) return null;
      const r = await fetch(`${this.baseUrl}/auth/dev-guest`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      return data && data.user ? data.user : null;
    }

    async authMe(timeoutMs = 3000) {
      if (!this.baseUrl || this.baseUrl.includes('REPLACE_WITH')) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(`${this.baseUrl}/auth/me`, { credentials: 'include', signal: ctrl.signal });
        if (!r.ok) return null;
        const data = await r.json().catch(() => null);
        return data && data.user ? data.user : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  window.backendClient = new BackendClient(window.BACKEND_CONFIG || {});
})();


