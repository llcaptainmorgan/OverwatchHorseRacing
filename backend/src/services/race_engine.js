// ################################################################################
// # Server Race Engine
// #
// # Contains:
// # - Racer: per-racer state and effects (buffs, laps, ability application)
// # - Race: tick simulation, event generation, results computation
// #
// # Note: This module is authoritative for movement, laps, finishes, and results.
// ################################################################################
import { RACE_SETTINGS } from '../config/settings.js';
import characterDatabase from '../data/character_database.json' assert { type: 'json' };

const M = RACE_SETTINGS.mechanics || {};

export class Racer {
  constructor(name, speed, power, stamina, determination = 70, racerStyle = 'pace_chaser', characterId = null) {
    this.name = name;
    this.characterId = characterId || String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    this.base_speed = speed;
    this.power = power;
    this.max_stamina = stamina;
    this.current_stamina = stamina;
    this.determination = determination;
    this.position = 0.0;
    this.finish_time = null;
    this.finished = false;
    // Unified active effects stack: { stat: 'speed'|'power'|'stamina'|'speed_mult'|'speed_slow', type: 'add'|'mult', amount, ttl }
    this.active_effects = [];
    // Recent overtake context (race_clock seconds)
    this.lastOvertakenAtClock = -9999;
    // Racer pacing profile
    this.racer_style = racerStyle || 'pace_chaser';
    // Internal cache for move
    this._lastComputedSpeed = 0;
    this.lapsCompleted = 0;
    this.passSlow = null;
  }

  updatePosition(dt, raceDistance) {
    if (this.finished) return;
    
    const beforePos = this.position;
    
    // Apply effect decay and remove expired
    this.updateEffects(dt);
    // Compute movement speed based on style, stamina, power, and modifiers
    const speedNow = this.computeSpeed(raceDistance);
    this._lastComputedSpeed = speedNow;
    const movement = speedNow * dt;
    this.position += movement;
    
    // Log speed calculation for first few updates (when position is near 0)
    if (beforePos < 1.0 && beforePos !== this.position) {
      console.log(`[Racer.updatePosition] ${this.name}: speed=${speedNow.toFixed(2)} m/s, dt=${dt.toFixed(3)}s, movement=${movement.toFixed(3)}m, pos ${beforePos.toFixed(2)}m → ${this.position.toFixed(2)}m`);
      console.log(`[Racer.updatePosition]   base_speed=${this.base_speed}, stamina=${this.current_stamina.toFixed(1)}/${this.max_stamina}, power=${this.power}`);
    }
    
    // Stamina drain scaled by exertion mitigated by power
    const baseDrain = M.base_stamina_drain_per_sec ?? 2.0;
    const exertionFactor = Math.max(M.exertion_min ?? 0.75, (speedNow / Math.max(1, this.base_speed)));
    const powerFactor = 1 + (this.power - 70) * (M.power_factor_coeff ?? 0.004);
    const drain = (baseDrain * exertionFactor) / Math.max(0.6, powerFactor);
    this.current_stamina = Math.max(0, Math.min(this.max_stamina, this.current_stamina - drain * dt));
  }

  updateEffects(dt) {
    if (!this.active_effects.length) return null;
    const messages = [];
    for (const eff of this.active_effects) { eff.ttl -= dt; }
    const kept = [];
    for (const eff of this.active_effects) {
      if (eff.ttl > 0) { kept.push(eff); continue; }
      if (eff.label) messages.push(`buff_expire: ${this.name}'s ${eff.label} wore off.`);
    }
    this.active_effects = kept;
    return messages.length ? messages.join('\n') : null;
  }

  computeSpeed(raceDistance) {
    const t = Math.max(0, Math.min(1, (this.position || 0) / (raceDistance || RACE_SETTINGS.race_distance || 1600)));
    const pace = this.paceMultiplier(t);
    const staminaFloor = M.stamina_floor ?? 0.35;
    const staminaFactor = Math.max(staminaFloor, Math.min(1.0, this.current_stamina / Math.max(1, this.max_stamina)));
    const powerFactor = 1 + (this.power - 70) * (M.power_factor_coeff ?? 0.004);
    // Aggregate modifiers
    let speedAdd = 0; // additive in same units as base_speed
    let speedMult = 1.0; // multiplicative cap at 1.35
    for (const eff of this.active_effects) {
      if (eff.stat === 'speed' && eff.type === 'add') speedAdd += eff.amount;
      if (eff.stat === 'speed' && eff.type === 'mult') speedMult *= eff.amount;
      if (eff.stat === 'speed_slow') speedAdd -= Math.abs(eff.amount);
    }
    const addCap = M.speed_add_cap ?? 8;
    const multCap = M.speed_mult_cap ?? 1.35;
    const multMin = M.speed_mult_min ?? 0.6;
    speedAdd = Math.max(-addCap, Math.min(addCap, speedAdd));
    speedMult = Math.min(multCap, Math.max(multMin, speedMult));
    const base = this.base_speed * (M.global_speed_scale ?? 1);
    const speed = base * pace * staminaFactor * powerFactor * speedMult + speedAdd + (this.power * 0.1);
    return Math.max(0.5, speed);
  }

  paceMultiplier(t) {
    const s = (this.racer_style || 'pace_chaser');
    if (s === 'front_runner' || s === 'front_sprinter') {
      const early = M.pace_profiles?.front_runner?.early ?? 1.08;
      const late = M.pace_profiles?.front_runner?.late ?? 0.96;
      return early + (late - early) * t;
    }
    if (s === 'late_surger') {
      const early = M.pace_profiles?.late_surger?.early ?? 0.94;
      const add = M.pace_profiles?.late_surger?.add ?? 0.16;
      const delay = M.pace_profiles?.late_surger?.delay_t ?? 0.2;
      return early + add * Math.max(0, t - delay);
    }
    if (s === 'end_sprinter') {
      const early = M.pace_profiles?.end_sprinter?.early ?? 0.92;
      const kick = M.pace_profiles?.end_sprinter?.kick_start_t ?? 0.8;
      const late = M.pace_profiles?.end_sprinter?.late ?? 1.10;
      return t >= kick ? late : early + (late - early) * (t / kick);
    }
    return 1.0;
  }

  applyTemporarySpeed(amount, durationSec, label = null) {
    this.active_effects.push({ stat: 'speed', type: 'add', amount, ttl: durationSec, label: label || (amount >= 0 ? 'speed boost' : 'slow') });
    if (amount < 0) return label || `debuff_apply: ${this.name} slowed for ${durationSec}s`;
    return label || `buff_apply: ${this.name} gets a speed boost for ${durationSec}s`;
  }

  cheer(race = null, opts = {}) {
    const events = [`cheer: ${this.name.toUpperCase()} IS BEING CHEERED!`];
    const forceAbility = Boolean(opts.forceAbility);
    if (forceAbility || Math.random() < 0.35) {
      events.push(...this.useAbility(race));
    } else {
      events.push(...this.applyRandomBuff());
    }
    return events;
  }

  lookupCharacter() {
    const db = characterDatabase?.characters || {};
    if (this.characterId && db[this.characterId]) return db[this.characterId];
    const key = String(this.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (db[key]) return db[key];
    for (const id of Object.keys(db)) {
      const n = String(db[id]?.display_name || '').toLowerCase();
      if (n && n === String(this.name || '').toLowerCase()) return db[id];
    }
    return null;
  }

  useAbility(race = null) {
    const character = this.lookupCharacter();
    const ability = character?.ability || {};
    const abilityName = ability.name || 'Ability';
    const effects = ability.effects || {};
    const lines = [];
    if (abilityName) lines.push(`ability: ${this.name} uses ${abilityName}!`);
    const voicePath = character?.voice?.ability_voiceline_path;
    if (voicePath) lines.push(`voiceline_path: ${voicePath}`);
    const dur = Number(effects.duration_sec) || (M.ability_speed_dur_sec ?? 3);

    const pos = Number(effects.position_add) || 0;
    const spd = Number(effects.speed_add) || 0;
    const spdMult = Number(effects.speed_mult) || 0;
    const pow = Number(effects.power_add) || 0;
    const sta = Number(effects.stamina_add) || 0;
    const det = Number(effects.determination_add) || 0;
    if (pos) {
      this.position += pos;
      lines.push(`ability: ${this.name} blinks ${Math.round(pos)}m ahead!`);
    }
    if (spd) {
      this.active_effects.push({ stat: 'speed', type: 'add', amount: spd, ttl: dur, label: abilityName });
    }
    if (spdMult && spdMult !== 1) {
      this.active_effects.push({ stat: 'speed', type: 'mult', amount: spdMult, ttl: dur, label: abilityName });
    }
    if (pow) { this.power = Math.max(1, this.power + pow); }
    if (sta) { this.current_stamina = Math.min(this.max_stamina, this.current_stamina + sta); }
    if (det) { this.determination += det; }

    const pack = effects.slow_others;
    if (pack && race && Array.isArray(race.racers)) {
      const radius = Number(pack.radius_m) || 70;
      const amt = Number(pack.amount) || 4;
      const packDur = Number(pack.duration_sec) || 2.5;
      let hit = 0;
      for (const other of race.racers) {
        if (!other || other === this || other.finished) continue;
        if (Math.abs((other.position || 0) - (this.position || 0)) > radius) continue;
        other.active_effects.push({ stat: 'speed_slow', type: 'add', amount: amt, ttl: packDur, label: `${abilityName} pace-down` });
        hit += 1;
      }
      if (hit) lines.push(`ability: ${this.name} slows ${hit} nearby racer${hit === 1 ? '' : 's'}!`);
    }

    if (effects.pass_slow) {
      this.passSlow = {
        amount: Number(effects.pass_slow.amount) || 5,
        duration_sec: Number(effects.pass_slow.duration_sec) || 2,
        charges: Number(effects.pass_slow.charges) || 2,
        label: abilityName,
      };
      lines.push(`ability: ${this.name} will rattle the next ${this.passSlow.charges} they pass!`);
    }

    return lines;
  }

  applyRandomBuff() {
    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      const amount = Math.round(((M.cheer_speed_add_min ?? 3) + Math.random() * ((M.cheer_speed_add_max ?? 8) - (M.cheer_speed_add_min ?? 3))) * 100) / 100;
      const duration = Math.round(((M.cheer_speed_dur_min ?? 2) + Math.random() * ((M.cheer_speed_dur_max ?? 5) - (M.cheer_speed_dur_min ?? 2))) * 100) / 100;
      this.active_effects.push({ stat: 'speed', type: 'add', amount, ttl: duration, label: 'cheer speed' });
      return [`buff_apply: ${this.name} gets +${amount} SPEED for ${duration}s!`];
    } else if (roll === 1) {
      const amount = (M.cheer_power_add_min ?? 2) + Math.floor(Math.random() * ((M.cheer_power_add_max ?? 6) - (M.cheer_power_add_min ?? 2) + 1));
      const duration = (M.cheer_power_dur_min ?? 6) + Math.floor(Math.random() * ((M.cheer_power_dur_max ?? 10) - (M.cheer_power_dur_min ?? 6) + 1));
      this.power = Math.max(1, this.power + amount);
      this.active_effects.push({ stat: 'power', type: 'add', amount, ttl: duration, label: 'cheer power' });
      return [`buff_apply: ${this.name} gets +${amount} POWER for ${duration}s!`];
    } else {
      const amount = (M.cheer_stamina_add_min ?? 8) + Math.floor(Math.random() * ((M.cheer_stamina_add_max ?? 16) - (M.cheer_stamina_add_min ?? 8) + 1));
      this.current_stamina = Math.min(this.max_stamina, this.current_stamina + amount);
      return [`buff_apply: ${this.name} restores ${amount} STAMINA!`];
    }
  }

  applySurge(durSec = (M.surge_duration_sec ?? 1.5)) {
    const detBoost = 1 + Math.max(0, (this.determination - 70)) * (M.surge_det_coeff ?? 0.003);
    this.active_effects.push({ stat: 'speed', type: 'mult', amount: detBoost, ttl: durSec, label: 'surge' });
  }

  applyRattleSlow(durSec = (M.rattle_duration_sec ?? 1.0)) {
    const slow = M.rattle_slow_amount ?? 3;
    this.active_effects.push({ stat: 'speed_slow', type: 'add', amount: slow, ttl: durSec, label: 'rattle' });
  }

  tryClearRattleOnCheer(nowClock) {
    if (typeof nowClock !== 'number') return null;
    if ((nowClock - this.lastOvertakenAtClock) > (M.cheer_clear_window_sec ?? 2.0)) return null;
    const pClear = Math.min((M.cheer_clear_max ?? 0.9), (M.cheer_clear_base ?? 0.3) + (this.determination - 70) * (M.cheer_clear_det_coeff ?? 0.01));
    if (Math.random() < pClear) {
      const before = this.active_effects.length;
      this.active_effects = this.active_effects.filter(e => e.label !== 'rattle');
      if (this.active_effects.length !== before) {
        return `debuff_clear: ${this.name} shakes off the rattle!`;
      }
      return null;
    } else {
      let mitigated = false;
      for (const eff of this.active_effects) {
        if (eff.label === 'rattle' && eff.amount > 1) { eff.amount = Math.max(1, Math.floor(eff.amount / 2)); mitigated = true; }
      }
      return mitigated ? `debuff_clear: ${this.name} mitigates the rattle.` : null;
    }
  }

  toJSON() {
    return {
      name: this.name,
      position: this.position,
      finished: this.finished,
      finish_time: this.finish_time,
      laps: this.lapsCompleted,
    };
  }
}

export class Race {
  constructor(racers) {
    this.racers = racers;
    this.race_clock = 0;
    this.finish_order = [];
    this.last_ranks = this.currentRanks();
    this.events = [];
    this.is_running = true;
    this.results_cached = null;
  }

  currentRanks() { return [...this.racers].sort((a, b) => b.position - a.position); }

  checkOvertakes() {
    const current = this.currentRanks();
    for (let i = 0; i < current.length; i++) {
      const racer = current[i];
      const prevIndex = this.last_ranks.indexOf(racer);
      if (prevIndex > -1 && i < prevIndex) {
        const overtaken = this.last_ranks[i];
        if (overtaken && !overtaken.finished) {
          this.events.push(`overtake: [${racer.name}] overtakes [${overtaken.name}]!`);
          try { racer.applySurge(M.surge_duration_sec ?? 1.5); } catch {}
          if (racer.passSlow && racer.passSlow.charges > 0 && overtaken) {
            overtaken.active_effects.push({
              stat: 'speed_slow',
              type: 'add',
              amount: racer.passSlow.amount,
              ttl: racer.passSlow.duration_sec,
              label: racer.passSlow.label || 'passed',
            });
            racer.passSlow.charges -= 1;
            this.events.push(`ability: ${overtaken.name} is paced down by ${racer.name}!`);
            if (racer.passSlow.charges <= 0) racer.passSlow = null;
          }
          if (overtaken) {
            const pBase = M.rattle_prob_base ?? 0.35;
            const detCoeff = M.rattle_prob_det_coeff ?? 0.004;
            const pMin = M.rattle_prob_min ?? 0.05;
            const pMax = M.rattle_prob_max ?? 0.45;
            const pDebuff = Math.max(pMin, Math.min(pMax, pBase - (overtaken.determination - 70) * detCoeff));
            if (Math.random() < pDebuff) {
              overtaken.applyRattleSlow(M.rattle_duration_sec ?? 1.0);
              this.events.push(`debuff_apply: ${overtaken.name} is rattled briefly!`);
            }
            overtaken.lastOvertakenAtClock = this.race_clock;
          }
        }
      }
    }
    this.last_ranks = current;
  }

  tick(dt) {
    if (!this.is_running) {
      console.log(`[Race.tick] ⚠️ tick() called but is_running=false, returning early`);
      return;
    }

    if (!this.racers || this.racers.length === 0) {
      console.error(`[Race.tick] ❌ No racers in race!`);
      return;
    }

    const beforeClock = this.race_clock;
    this.race_clock += dt;

    // Log first few ticks for debugging
    if (beforeClock < 0.5) {
      console.log(`[Race.tick] 🕐 Clock: ${beforeClock.toFixed(3)}s → ${this.race_clock.toFixed(3)}s (dt=${dt.toFixed(3)}s)`);
      console.log(`[Race.tick] 📊 Racers count: ${this.racers.length}, inRace: ${this.racers.filter(r => !r.finished).length}`);
    }

    const inRace = this.racers.filter(r => !r.finished);
    if (inRace.length && Math.random() < 0.05) {
      this.events.push(...inRace[Math.floor(Math.random() * inRace.length)].cheer(this));
    }

    for (const r of this.racers) {
      const beforePos = r.position;
      const effMsg = r.updateEffects(dt);
      if (effMsg) this.events.push(effMsg);
      r.updatePosition(dt, RACE_SETTINGS.race_distance);
      const afterPos = r.position;

      // Log position updates for first few ticks
      if (beforeClock < 0.5 && beforePos !== afterPos) {
        console.log(`[Race.tick]   ${r.name}: ${beforePos.toFixed(2)}m → ${afterPos.toFixed(2)}m (+${(afterPos - beforePos).toFixed(2)}m)`);
      }

      const lapsNow = Math.floor(r.position / (RACE_SETTINGS.lap_distance || 400));
      if (lapsNow > r.lapsCompleted && !r.finished) {
        r.lapsCompleted = lapsNow;
        this.events.push(`lap: ${r.name} completes lap ${lapsNow}!`);
      }
      if (r.position >= RACE_SETTINGS.race_distance && !r.finished) {
        r.finished = true;
        r.finish_time = Math.round(this.race_clock * 100) / 100;
        this.finish_order.push(r);
        this.events.push(`finish: ${r.name} has finished the race!`);
      }
    }
    this.checkOvertakes();
    
    // Safety check: Don't end race if no one has moved yet (prevents instant completion bug)
    const maxPosition = Math.max(...this.racers.map(r => r.position || 0));
    const shouldEnd = this.finish_order.length >= Math.min(this.racers.length, RACE_SETTINGS.max_players);
    
    if (shouldEnd) {
      // Log completion details for debugging
      console.log(`[Race.tick] 🏁 Race completion check: finish_order.length=${this.finish_order.length}, racers.length=${this.racers.length}, max_players=${RACE_SETTINGS.max_players}`);
      console.log(`[Race.tick]   Finished racers:`, this.finish_order.map(r => `${r.name} (pos=${r.position.toFixed(1)}m)`).join(', '));
      console.log(`[Race.tick]   Max position: ${maxPosition.toFixed(1)}m, race_distance: ${RACE_SETTINGS.race_distance}`);
      
      // Prevent instant completion if no one has moved
      if (maxPosition < 1.0 && this.race_clock < 0.5) {
        console.error(`[Race.tick] ❌ RACE COMPLETION BUG DETECTED: Race ending instantly with no movement!`);
        console.error(`[Race.tick]   finish_order:`, this.finish_order.map(r => ({ name: r.name, pos: r.position, finished: r.finished })));
        console.error(`[Race.tick]   All racers:`, this.racers.map(r => ({ name: r.name, pos: r.position, finished: r.finished })));
        // Don't end race if this is clearly a bug
        return;
      }
      
      this.is_running = false;
      this.events.push('event: ====== RACE CONCLUDED! ======');
      this.results_cached = this.computeResults();
    }
  }

  computeResults() {
    const placements = this.finish_order.map((r, i) => ({
      position: i + 1,
      name: r.name,
      finish_time: r.finish_time,
      points: this.pointsForPlace(i + 1),
    }));
    return { placements };
  }

  pointsForPlace(place) {
    const table = { 1: 50000, 2: 23000, 3: 16000, 4: 3250, 5: 1110, 6: 660 };
    return table[place] || 0;
  }
}


