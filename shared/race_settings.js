// RACE RULES source of truth (distance, ticks, speed, buffs).
// Backend imports this via backend/src/config/settings.js.
//
// Visual oval / start-column knobs do NOT live here.
// Tune those in main/ui_config.js → trackPath.

export const RACE_SETTINGS = {
  race_distance: 1600,
  lap_distance: 400,
  total_laps: 4,
  max_players: 6,
  tick_interval_ms: 100,
  intermission_duration_sec: 180,
  mechanics: {
    global_speed_scale: 0.4, // applied before hero/buff modifiers
    pace_profiles: {
      front_runner: { early: 1.08, late: 0.96 },
      pace_chaser: { early: 1.0, late: 1.0 },
      late_surger: { early: 0.94, add: 0.16, delay_t: 0.2 },
      end_sprinter: { early: 0.92, kick_start_t: 0.8, late: 1.10 },
    },
    stamina_floor: 0.35,
    power_factor_coeff: 0.004,
    base_stamina_drain_per_sec: 2.0,
    exertion_min: 0.75,
    speed_add_cap: 8,
    speed_mult_cap: 1.35,
    speed_mult_min: 0.6,
    surge_det_coeff: 0.003,
    surge_duration_sec: 1.5,
    rattle_slow_amount: 3,
    rattle_duration_sec: 1.0,
    rattle_prob_base: 0.35,
    rattle_prob_min: 0.05,
    rattle_prob_max: 0.45,
    rattle_prob_det_coeff: 0.004,
    cheer_clear_window_sec: 2.0,
    cheer_clear_base: 0.3,
    cheer_clear_det_coeff: 0.01,
    cheer_clear_max: 0.9,
    cheer_speed_add_min: 3,
    cheer_speed_add_max: 8,
    cheer_speed_dur_min: 2,
    cheer_speed_dur_max: 5,
    cheer_power_add_min: 2,
    cheer_power_add_max: 6,
    cheer_power_dur_min: 6,
    cheer_power_dur_max: 10,
    cheer_stamina_add_min: 8,
    cheer_stamina_add_max: 16,
    ability_speed_dur_sec: 3,
  },
};

export default RACE_SETTINGS;
