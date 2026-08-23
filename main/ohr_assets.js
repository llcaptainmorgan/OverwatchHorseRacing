/**
 * Shared character asset path helper for OHR.
 * Canon ID → roster (player cards) / horse_full (selection) / sprite (runners).
 */
(function () {
  const CANON_MAP = {
    torbjörn: 'torbjorn',
    torbjorn: 'torbjorn',
    winstonn: 'winston',
    winnston: 'winston',
    winston: 'winston',
    brigette: 'brigitte',
    'soldier:76': 'soldier76',
    soldier76: 'soldier76',
  };

  /** Roster filename stem overrides (disk typos). Canon id stays winston. */
  const ROSTER_FILE_STEM = {
    winston: 'winnston',
    brigitte: 'brigitte', // try brigitte first; fallback handled in applyRosterSrc
  };

  const ROSTER_FALLBACKS = {
    winston: ['winnston'],
    brigitte: ['brigette'],
  };

  const SPRITE_FILE_STEM = {
    winston: 'winton',
  };

  function normalizeId(id) {
    return (id || '').toString().toLowerCase().replace(/[\s\.:]/g, '');
  }

  function canonicalizeId(id) {
    const n = normalizeId(id);
    if (CANON_MAP[n]) return CANON_MAP[n];
    return n.normalize ? n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') : n;
  }

  function rosterStem(canonId) {
    return ROSTER_FILE_STEM[canonId] || canonId;
  }

  function spriteStem(canonId) {
    return SPRITE_FILE_STEM[canonId] || canonId;
  }

  function rosterPaths(characterId, assets) {
    const canon = canonicalizeId(characterId);
    const stem = rosterStem(canon);
    const paths = [];
    if (assets && assets.thumbnail) paths.push(assets.thumbnail);
    paths.push(`../images/current_roster/${stem}_roster.png`);
    if (stem !== canon) paths.push(`../images/current_roster/${canon}_roster.png`);
    const extras = ROSTER_FALLBACKS[canon] || [];
    extras.forEach((s) => paths.push(`../images/current_roster/${s}_roster.png`));
    return [...new Set(paths)];
  }

  function horseFullPaths(characterId, assets) {
    const canon = canonicalizeId(characterId);
    const paths = [];
    if (assets && assets.portrait_large) paths.push(assets.portrait_large);
    paths.push(
      `../images/current_roster/${canon}_horse_full.png`,
      `../images/current_roster/${canon}_Horse_Full.png`,
      `../images/current_roster/${canon}_horse_Full.png`
    );
    if (canon === 'winston') {
      paths.push('../images/current_roster/winston_horse_full.png');
    }
    return [...new Set(paths)];
  }

  function spritePaths(characterId, assets) {
    const canon = canonicalizeId(characterId);
    const stem = spriteStem(canon);
    const paths = [];
    // Prefer on-disk naming conventions first (DB paths sometimes use wrong small/sprite order)
    paths.push(
      `../images/current_roster/${stem}_sprite_small.png`,
      `../images/current_roster/${stem}_small_sprite.png`,
      `../images/current_roster/${canon}_sprite_small.png`,
      `../images/current_roster/${canon}_small_sprite.png`
    );
    const cap = stem.charAt(0).toUpperCase() + stem.slice(1);
    paths.push(
      `../images/current_roster/${cap}_sprite_small.png`,
      `../images/current_roster/${cap}_small_sprite.png`
    );
    if (assets && assets.racing_sprite) paths.push(assets.racing_sprite);
    return [...new Set(paths)];
  }

  /** Primary roster URL (best first guess for banners). */
  function rosterSrc(characterId, assets) {
    return rosterPaths(characterId, assets)[0];
  }

  function horseFullSrc(characterId, assets) {
    return horseFullPaths(characterId, assets)[0];
  }

  function spriteSrc(characterId, assets) {
    return spritePaths(characterId, assets)[0];
  }

  /** Apply roster src with onerror fallback chain. */
  function applyRosterSrc(imgEl, characterId, assets) {
    if (!imgEl) return;
    const paths = rosterPaths(characterId, assets);
    let i = 0;
    const tryNext = () => {
      if (i >= paths.length) return;
      const src = paths[i++];
      imgEl.onerror = () => tryNext();
      imgEl.src = src;
    };
    tryNext();
  }

  function applyHorseFullSrc(imgEl, characterId, assets) {
    if (!imgEl) return;
    const paths = horseFullPaths(characterId, assets);
    let i = 0;
    const tryNext = () => {
      if (i >= paths.length) return;
      const src = paths[i++];
      imgEl.onerror = () => tryNext();
      imgEl.src = src;
    };
    tryNext();
  }

  window.OHRAssets = {
    canonicalizeId,
    normalizeId,
    rosterPaths,
    horseFullPaths,
    spritePaths,
    rosterSrc,
    horseFullSrc,
    spriteSrc,
    applyRosterSrc,
    applyHorseFullSrc,
    rosterStem,
    spriteStem,
  };
})();
