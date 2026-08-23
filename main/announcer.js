(function(){
  class Announcer {
    constructor() {
      this.templates = null;
      this.enabled = true;
      this.lastSpokeAt = 0;
      this.nextAllowedAt = 0;
      this.currentSpeaker = null; // 'ana' | 'lifeweaver'
      this.cooldowns = new Map(); // eventKey -> nextAllowedAt
      this.dialogEl = null;
      this.textEl = null;
      this.profileEl = null;
      this.typeTimer = null;
      this.currentAudio = null;
      this.phase = 'intermission';
      this.minGapDefault = 2;
      this.maxGapDefault = 20;
      this.priorityNow = 0;
      this._lastStatus = 'idle';
      this._handledFinish = false;
      this.init();
    }

    async init() {
      try {
        // Load templates
        const resp = await fetch('../sounds/OHR_Voicelines/voicelines.templates.json');
        this.templates = await resp.json();
      } catch {}
      this.ensureDialog();
      // Listen to game state updates
      document.addEventListener('gameStateChanged', (e) => {
        this.phase = e.detail?.newState || this.phase;
        if (this.phase !== 'racing') this.hideDialog(true);
      });
      // Hook into racing event stream via global handler
      const self = this;
      const oldHandle = window.ohrRacingSystem?.racingSystem?.applyPanelVfxFromEvent;
      if (window.ohrRacingSystem && window.ohrRacingSystem.racingSystem && oldHandle) {
        const rs = window.ohrRacingSystem.racingSystem;
        rs._applyPanelVfxFromEvent = oldHandle.bind(rs);
        rs.applyPanelVfxFromEvent = function(ev, type){
          rs._applyPanelVfxFromEvent(ev, type);
          self.onServerEvent(ev, type);
        };
      }
      // Poll server state for finish/win handling
      setInterval(() => {
        const st = window._lastServerState || null;
        if (!st) return;
        const status = st.status || (st.phase === 'results' ? 'finished' : 'idle');
        if (status !== this._lastStatus) {
          this._lastStatus = status;
          if (status === 'finished' && !this._handledFinish) {
            this._handledFinish = true;
            this.handleRaceFinished(st);
          }
          if (status !== 'finished') {
            this._handledFinish = false;
          }
        }
      }, 500);

      // Expose quick demo helpers
      window.ohrAnnouncerDemo = {
        line: (text = 'Demo line: announcer dialog rendering test', speaker = (Math.random() < 0.5 ? 'ana' : 'lifeweaver')) => {
          this.showLine(String(text), speaker);
        },
        interrupter: () => this.playInterrupter(),
        antiSpam: () => {
          this.onServerEvent('anti_spam: SOMEONE overcheered - slowed briefly', 'debuff');
        },
        hide: () => this.hideDialog(true)
      };
    }

    ensureDialog() {
      if (this.dialogEl) return;
      const wrap = document.createElement('div');
      wrap.id = 'announcer-dialog';
      wrap.className = 'announcer-dialog hidden';
      wrap.setAttribute('aria-live', 'polite');
      wrap.innerHTML = `
        <div class="announcer-box">
          <img class="announcer-profile" alt="Announcer" />
          <div class="announcer-text" id="announcer-text"></div>
        </div>`;
      wrap.addEventListener('click', () => this.hideDialog(true));
      document.body.appendChild(wrap);
      this.dialogEl = wrap;
      this.textEl = wrap.querySelector('#announcer-text');
      this.profileEl = wrap.querySelector('.announcer-profile');
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hideDialog(true); });
    }

    onServerEvent(ev, type) {
      if (this.phase !== 'racing' || !this.templates) return;
      const key = this.mapTypeToEvent(type, ev);
      if (!key) return;
      // Special: anti-spam gets an interrupter, then follow-up
      if (key === 'anti_spam_warning') {
        this.playInterrupter();
        // allow immediate follow-up regardless of nextAllowedAt
        this.nextAllowedAt = 0;
      }
      const tEvent = this.templates.events[key];
      if (!tEvent) return;
      // Priority & gaps
      const now = Date.now() / 1000;
      const minGap = Number(tEvent?.rules?.min_gap_sec ?? this.minGapDefault);
      const maxGap = Number(tEvent?.rules?.max_gap_sec ?? this.maxGapDefault);
      const priority = Number(tEvent?.rules?.priority ?? 0);
      const interruptible = !!tEvent?.rules?.interruptible;
      const cooldown = Number(tEvent?.rules?.cooldown_sec ?? 0);
      // cooldown check per event
      const nextForKey = Number(this.cooldowns.get(key) || 0);
      if (now < nextForKey) return;
      // gap check unless it's an interrupt_shout
      if (key !== 'interrupt_shout' && now < this.nextAllowedAt) return;
      // priority interrupt
      if (priority > this.priorityNow && interruptible) {
        this.stopType();
        this.hideDialog(false);
      } else if (priority < this.priorityNow) {
        // ignore lower-priority while higher is active
        return;
      }
      this.priorityNow = priority;
      // build line
      const [line, speaker] = this.composeLine(key, ev, tEvent);
      if (!line) return;
      // schedule next windows
      this.lastSpokeAt = now;
      const nextGap = key === 'interrupt_shout' ? 0 : (minGap + Math.random() * Math.max(0, maxGap - minGap));
      this.nextAllowedAt = now + nextGap;
      if (cooldown > 0) this.cooldowns.set(key, now + cooldown);
      // play
      this.showLine(line, speaker);
      this.playVoice(line, speaker);
    }

    mapTypeToEvent(type, ev) {
      if (type === 'overtake') return 'overtake';
      if (type === 'ability') return 'ability_used';
      if (type === 'finish') return 'race_finish';
      if (type === 'debuff') {
        if (String(ev).startsWith('anti_spam:')) return 'anti_spam_warning';
        return 'debuff_applied';
      }
      if (type === 'system' && String(ev).startsWith('lap:')) return 'lap_milestone';
      return null;
    }

    handleRaceFinished(state) {
      // Announce race finished, then winner
      const finishEvent = this.templates?.events?.race_finish;
      if (finishEvent) {
        const [line, speaker] = this.composeLine('race_finish', 'finish: race', finishEvent);
        if (line) { this.showLine(line, speaker); this.playVoice(line, speaker); }
      }
      // Winner
      try {
        const first = state?.results?.placements?.[0]?.name || null;
        if (first && this.templates?.events?.race_win) {
          // small delay to allow finish line to start
          setTimeout(() => {
            const [wLine, wSpeaker] = this.composeLine('race_win', `win: ${first}`, this.templates.events.race_win);
            if (wLine) { this.showLine(wLine, wSpeaker); this.playVoice(wLine, wSpeaker); }
          }, 800);
        }
      } catch {}
    }

    playInterrupter() {
      const tEvent = this.templates?.events?.interrupt_shout;
      if (!tEvent) return;
      const [line, speaker] = this.composeLine('interrupt_shout', 'interrupt', tEvent);
      if (!line) return;
      const now = Date.now() / 1000;
      this.priorityNow = Number(tEvent?.rules?.priority ?? 90);
      this.nextAllowedAt = now; // do not push gap window
      this.showLine(line, speaker);
      this.playVoice(line, speaker);
    }

    composeLine(key, ev, tEvent) {
      // Alternate speakers randomly
      const speaker = Math.random() < 0.5 ? 'ana' : 'lifeweaver';
      const templates = (tEvent.speaker_overrides && tEvent.speaker_overrides[speaker]) || tEvent.templates || [];
      if (!templates.length) return [null, null];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      const [A, B, ability] = this.extractPlaceholders(ev);
      const text = tpl.replace('{A}', A).replace('{B}', B).replace('{ability}', ability);
      const suffixes = tEvent.suffixes || [];
      const withSuffix = Math.random() < 0.5 && suffixes.length ? text + ' ' + suffixes[Math.floor(Math.random() * suffixes.length)] : text;
      return [withSuffix, speaker];
    }

    extractPlaceholders(ev) {
      // crude parse from event strings
      const s = String(ev || '');
      let A = 'Racer';
      let B = 'Rival';
      let ability = 'Ability';
      const over = s.match(/overtake:\s*\[(.*?)\]\s*overtakes\s*\[(.*?)\]/i);
      if (over) { A = over[1]; B = over[2]; }
      const ab = s.match(/ability:\s+([^\s].*?)\s/);
      if (ab) { A = ab[1]; const abNm = s.match(/uses\s+(.*?)!/i); if (abNm) ability = abNm[1]; }
      const lap = s.match(/lap:\s*(.*?)\s+completes/i); if (lap) A = lap[1];
      const deb = s.match(/anti_spam:\s+([\w\s\-\.]+)/i); if (deb) A = deb[1].trim();
      return [A, B, ability];
    }

    showLine(text, speaker) {
      if (!this.enabled) return;
      this.ensureDialog();
      // Set profile
      const img = this.profileEl;
      if (img) {
        img.src = speaker === 'ana' ? '../images/ana_announcer_profile_image.webp' : '../images/lifeweaver_male_announcer_profile_image.png';
        img.alt = speaker;
      }
      // Typewriter effect
      this.dialogEl.classList.remove('hidden');
      this.dialogEl.classList.add('anim-fade-in');
      this.typeText(text);
    }

    typeText(text) {
      if (!this.textEl) return;
      this.stopType();
      this.textEl.textContent = '';
      let i = 0;
      const speed = 18; // chars per tick
      this.typeTimer = setInterval(() => {
        const chunk = text.slice(i, i + 2);
        this.textEl.textContent += chunk;
        i += 2;
        if (i >= text.length) {
          this.stopType();
          // Auto-hide 1s after voice audio ends
          const audio = window.audioSystem?.audioElements?.voicelines;
          const delay = audio && !audio.paused ? ((audio.duration - audio.currentTime) * 1000 + 1000) : 1500;
          setTimeout(() => this.hideDialog(false), Math.max(800, delay));
        }
      }, 30);
    }

    stopType() {
      if (this.typeTimer) { try { clearInterval(this.typeTimer); } catch {} this.typeTimer = null; }
    }

    hideDialog(immediate) {
      if (!this.dialogEl) return;
      if (immediate) {
        this.dialogEl.classList.add('hidden');
      } else {
        this.dialogEl.classList.remove('anim-fade-in');
        this.dialogEl.classList.add('anim-fade-out');
        setTimeout(() => this.dialogEl.classList.add('hidden'), 240);
      }
      this.priorityNow = 0;
    }

    playVoice(text, speaker) {
      const audio = window.audioSystem?.audioElements?.voicelines;
      if (!audio) return;
      // Placeholder: until real assets are generated, skip loading actual files
      try {
        // honor mute toggle if present
        if (window.audioSystem && typeof window.audioSystem.announcerMuted === 'boolean' && window.audioSystem.announcerMuted) return;
        audio.pause();
        audio.currentTime = 0;
        // Could map text hash to filename later
        // audio.src = `../sounds/OHR_Voicelines/${speaker}/...generated_key....mp3`;
        // audio.play().catch(()=>{});
      } catch {}
    }
  }

  // Styles for announcer dialog
  const style = document.createElement('style');
  style.textContent = `
    .announcer-dialog { position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%); z-index: 1550; }
    .announcer-dialog.hidden { display: none; }
    .announcer-box { display: flex; align-items: center; gap: 10px; background: rgba(215,240,241,0.92); border: 2px solid #fcc7db; border-radius: 16px; padding: 10px 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
    .announcer-profile { width: 42px; height: 42px; border-radius: 50%; border: 2px solid #ff7f22; object-fit: cover; background: #404d70; }
    .announcer-text { max-width: 66vw; color: #404d70; font-weight: bold; font-size: 14px; }
    @media (max-width: 768px) { .announcer-box { padding: 8px 10px; } .announcer-profile { width: 34px; height: 34px; } .announcer-text { font-size: 12px; max-width: 78vw; } }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', () => { window.ohrAnnouncer = new Announcer(); });
})();
