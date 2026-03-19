/**
 * Shared Pricing Core — pure computation functions used by both Node.js CLI and browser HTML.
 *
 * Rules:
 * - Pure .mjs — no TypeScript, no external dependencies
 * - All functions use `export function` syntax (stripped to bare `function` when inlined in HTML)
 * - No cross-module imports — this file is self-contained
 * - No side effects (console.log, DOM, fetch, etc.)
 */

// ─── Provider Aliases & Normalization ─────────────────────────────────────────

export const PROVIDER_ALIASES = {
  gemini: 'google',
  vertex_ai: 'google',
  vertex_ai_beta: 'google',
  google: 'google',
  anthropic: 'anthropic',
  openai: 'openai',
  'text-completion-openai': 'openai',
  chatgpt: 'openai',
  deepseek: 'deepseek',
  xai: 'xai',
  'x-ai': 'xai',
  openrouter: 'openrouter',
  volcengine: 'doubao',
};

export const PROVIDER_TIERS = {
  tier1: ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'doubao'],
  tier2: ['poe', 'openrouter', 'rock'],
};

export const MODEL_NAME_OVERRIDES = {
  'gemini-flash-2.5': 'gemini-2.5-flash',
  'gpt-3.5-turbo-instruct': 'gpt-3.5-turbo-instruct',
};

export const MODEL_PREFIX_TO_PROVIDER = {
  'claude-': 'anthropic',
  'gpt-': 'openai',
  'o1-': 'openai',
  'o3-': 'openai',
  'o4-': 'openai',
  'gemini-': 'google',
  'grok-': 'xai',
  'deepseek-': 'deepseek',
};

export const PRICING_URLS = {
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/pricing',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  xai: 'https://docs.x.ai/developers/models',
  openai: 'https://platform.openai.com/docs/pricing',
  doubao: 'https://www.volcengine.com/docs/82379/1544106',
  openrouter: 'https://openrouter.ai/models',
  bedrock: 'https://aws.amazon.com/bedrock/pricing/',
  ideogram: 'https://ideogram.ai/pricing',
  poe: 'https://poe.com/api/models',
};

export const PROV_NAMES = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  doubao: 'Doubao',
  ideogram: 'Ideogram',
  minimax: 'MiniMax',
  bedrock: 'Bedrock',
  poe: 'Poe',
};

export function provName(p) {
  return PROV_NAMES[p.toLowerCase()] || p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * Normalize a provider name to the canonical DB provider name.
 * Tries exact match first, then prefix match (e.g. "vertex_ai_beta" via "vertex_ai").
 * Returns undefined if no match found.
 */
export function normalizeProvider(name) {
  const lower = name.toLowerCase();
  if (PROVIDER_ALIASES[lower]) return PROVIDER_ALIASES[lower];
  for (const [alias, canonical] of Object.entries(PROVIDER_ALIASES)) {
    if (lower.startsWith(alias)) return canonical;
  }
  if (lower.startsWith('bedrock')) return 'bedrock';
  return undefined;
}

/**
 * Generate fallback model name variants for lookup.
 */
export function modelNameFallbacks(model) {
  if (MODEL_NAME_OVERRIDES[model]) {
    return [MODEL_NAME_OVERRIDES[model]];
  }
  const fallbacks = [];
  // claude-xxx-N-0 → claude-xxx-N
  if (/^claude-.*-\d+-0$/.test(model)) {
    fallbacks.push(model.replace(/-0$/, ''));
  }
  // gpt-4o-2024-08-06 → gpt-4o (date suffix)
  const dateMatch = model.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch?.[1]) {
    fallbacks.push(dateMatch[1]);
  }
  return fallbacks;
}

/**
 * For tier2 providers, resolve the underlying tier1 provider and model name.
 */
export function resolveModelMapping(dbModel, dbProvider) {
  const canonicalProvider = normalizeProvider(dbProvider) || dbProvider;
  const isTier2 = PROVIDER_TIERS.tier2.includes(canonicalProvider);
  const resolvedModel = MODEL_NAME_OVERRIDES[dbModel] || dbModel;

  if (!isTier2) {
    return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
  }

  // OpenRouter: "anthropic/claude-sonnet-4" → split on /
  if (canonicalProvider === 'openrouter' && resolvedModel.includes('/')) {
    const slashIdx = resolvedModel.indexOf('/');
    const providerPrefix = resolvedModel.slice(0, slashIdx);
    const modelName = resolvedModel.slice(slashIdx + 1);
    const mappedProvider = normalizeProvider(providerPrefix);
    if (mappedProvider && PROVIDER_TIERS.tier1.includes(mappedProvider)) {
      return { primaryProvider: mappedProvider, primaryModel: modelName };
    }
  }

  // Poe and others: infer provider from model name prefix
  for (const [prefix, provider] of Object.entries(MODEL_PREFIX_TO_PROVIDER)) {
    if (resolvedModel.startsWith(prefix)) {
      return { primaryProvider: provider, primaryModel: resolvedModel };
    }
  }

  return { primaryProvider: canonicalProvider, primaryModel: resolvedModel };
}

/**
 * Derive resolution tiers for image models with per-image and per-image-token pricing.
 */
export function deriveResolutionTiers(outputCostPerImage, outputCostPerImageToken) {
  if (outputCostPerImage == null || outputCostPerImageToken == null) return undefined;
  if (outputCostPerImageToken === 0) return undefined;

  const stdTokens = Math.round(outputCostPerImage / outputCostPerImageToken);
  const hiTokens = Math.round(stdTokens * 1.786);
  const stdCost = outputCostPerImage;
  const hiCost = outputCostPerImageToken * hiTokens;

  if (Math.abs(hiCost - stdCost) / stdCost <= 0.05) return undefined;

  return [
    { quality: '1K-2K', size: `~${stdTokens}tok`, costPerImage: stdCost },
    { quality: '4K', size: `~${hiTokens}tok`, costPerImage: hiCost },
  ];
}

// ─── Math Utilities ───────────────────────────────────────────────────────────

export function calcDrift(dbValue, sourceValue) {
  const maxVal = Math.max(Math.abs(dbValue), Math.abs(sourceValue));
  if (maxVal === 0) return 0;
  return Math.abs(dbValue - sourceValue) / maxVal;
}

export function calcMargin(sell, cost) {
  if (sell === undefined || sell === null || cost === undefined || cost === null || cost === 0) return undefined;
  return ((sell - cost) / cost) * 100;
}

export function closeEnough(a, b, tol) {
  if (tol === undefined) tol = 0.02;
  return a != null && b != null && b !== 0 && Math.abs(a - b) / Math.abs(b) < tol;
}

export function aboveOrClose(sell, cost, tol) {
  if (tol === undefined) tol = 0.005;
  return sell != null && cost != null && cost > 0 && sell >= cost * (1 - tol);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a price value for display (plain text).
 * @param {number} v - price in $/token, $/image, or $/second
 * @param {string} unit - 'per-token' | 'per-image' | 'per-second'
 * @returns {string}
 */
export function formatPrice(v, unit) {
  if (unit === undefined) unit = 'per-token';
  if (v === undefined || v === null) return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  if (n === 0) return '$0';
  if (unit === 'per-image') return '$' + n.toFixed(4) + '/张';
  if (unit === 'per-second') return '$' + n.toFixed(4) + '/sec';
  // per-token: display as $/MTok
  const mtok = n * 1e6;
  if (mtok < 0.0001) return '$' + mtok.toFixed(7);
  if (mtok < 0.01) return '$' + mtok.toFixed(5);
  if (mtok < 1) return '$' + mtok.toFixed(3);
  if (mtok < 10) return '$' + mtok.toFixed(2);
  return '$' + mtok.toFixed(1);
}

/**
 * Format price as HTML (with <span class="na">-</span> for nulls).
 */
export function formatPriceHtml(v, pricingUnit) {
  if (v === undefined || v === null) return '<span class="na">-</span>';
  if (v === 0) return '$0';
  if (pricingUnit === 'per-image') return '$' + Number(v).toFixed(4) + '/张';
  if (pricingUnit === 'per-second') return '$' + Number(v).toFixed(4) + '/sec';
  const p = v * 1e6;
  if (p < 0.0001) return '$' + p.toFixed(7);
  if (p < 0.01) return '$' + p.toFixed(5);
  if (p < 1) return '$' + p.toFixed(3);
  return '$' + p.toFixed(2);
}

// ─── Classification ───────────────────────────────────────────────────────────

export function isPerUnitPricing(m) {
  return m.pricingUnit === 'per-image' || m.pricingUnit === 'per-second';
}

/**
 * Get the highest-tier costs for margin comparison.
 * For tiered pricing: use highest tier. For resolution tiers: use max costPerImage.
 */
export function getMarginCosts(entry) {
  var costIn = entry.inputCostPerToken;
  var costOut = entry.outputCostPerToken;
  if (entry.tieredPricing && entry.tieredPricing.length) {
    var hi = entry.tieredPricing[entry.tieredPricing.length - 1];
    if (hi.input) costIn = hi.input;
    if (hi.output) costOut = hi.output;
  }
  if (entry.resolutionTiers && entry.resolutionTiers.length) {
    var maxCPI = 0;
    entry.resolutionTiers.forEach(function (t) {
      if (t.costPerImage > maxCPI) maxCPI = t.costPerImage;
    });
    if (maxCPI) costOut = maxCPI;
  }
  return { input: costIn, output: costOut };
}

/**
 * Check if a model has below-cost pricing (sell < cost).
 * @param {object} m - comparison result or entry+rate hybrid
 * @param {number} threshold - percentage threshold (default 2)
 */
export function hasBelowCost(m, threshold) {
  if (threshold === undefined) threshold = 2;
  const isUnit = isPerUnitPricing(m);
  if (
    (m.outputMargin != null && m.outputMargin < -threshold) ||
    (!isUnit && m.inputMargin != null && m.inputMargin < -threshold)
  )
    return true;
  // Cache write: cost exists but sell is missing or below cost
  const cw = m.officialCacheWrite ?? m.litellmCacheWrite;
  const sw = m.dbCacheWrite;
  if (cw > 0 && (!sw || ((sw - cw) / cw) * 100 < -threshold)) return true;
  // Cache read: cost exists but sell is missing or below cost
  const cr = m.officialCacheRead ?? m.litellmCacheRead;
  const sr = m.dbCacheRead;
  if (cr > 0 && (!sr || ((sr - cr) / cr) * 100 < -threshold)) return true;
  return false;
}

/**
 * Check if a model has sell price drift (DB sell vs best-cost margin exceeds threshold).
 */
export function hasDrift(m, threshold) {
  if (threshold === undefined) threshold = 2;
  const isUnit = isPerUnitPricing(m);
  const inputOff = !isUnit && m.inputMargin != null && Math.abs(m.inputMargin) > threshold;
  const outputOff = m.outputMargin != null && Math.abs(m.outputMargin) > threshold;
  if (inputOff || outputOff) return true;
  if (m.cacheTierWriteDrift > 0 || m.cacheTierReadDrift > 0) return true;
  // Cache read/write: DB value vs external reference (bidirectional)
  const cw = m.officialCacheWrite ?? m.litellmCacheWrite;
  if (cw > 0 && m.dbCacheWrite > 0) {
    if (Math.abs(((m.dbCacheWrite - cw) / cw) * 100) > threshold) return true;
  }
  const cr = m.officialCacheRead ?? m.litellmCacheRead;
  if (cr > 0 && m.dbCacheRead > 0) {
    if (Math.abs(((m.dbCacheRead - cr) / cr) * 100) > threshold) return true;
  }
  return false;
}

/**
 * Check if sell price is not at highest tier (potential loss at high volume).
 */
export function hasNotHighestTier(m) {
  const sO = m.outputRate ?? m.dbOutput;
  const sI = m.inputRate ?? m.dbInput;
  if (m.tieredPricing?.length) {
    const hi = m.tieredPricing[m.tieredPricing.length - 1];
    if (!aboveOrClose(sO, hi.output) || (!isPerUnitPricing(m) && !aboveOrClose(sI, hi.input))) return true;
  }
  if (m.resolutionTiers?.length) {
    const maxCost = Math.max(...m.resolutionTiers.map((t) => t.costPerImage));
    if (!aboveOrClose(sO, maxCost)) return true;
  }
  if (m.officialCacheTiers?.length) {
    const writeTiers = m.officialCacheTiers.filter((t) => t.label.includes('write'));
    if (writeTiers.length > 1) {
      const maxWrite = Math.max(...writeTiers.map((t) => t.costPerToken));
      const dbCW = m.dbCacheWrite ?? 0;
      if (!aboveOrClose(dbCW, maxWrite)) return true;
    }
  }
  return false;
}

export function hasNoData(m) {
  return (
    !m.bestCostOutput &&
    !m.bestCostInput &&
    !m.providerPageInput &&
    !m.litellmInput &&
    !m.openrouterInput &&
    !m.litellmOutputPerImage &&
    !m.litellmOutputPerSecond
  );
}

export function hasNoOfficial(m) {
  return (
    m.providerPageInput === undefined &&
    m.providerPageOutput === undefined &&
    !(m.provider === 'openrouter' && m.openrouterInput !== undefined)
  );
}

/**
 * Classify a model into one of: 'below-cost' | 'drift' | 'no-match' | 'normal'.
 */
export function classifyModel(m) {
  if (hasBelowCost(m) || hasNotHighestTier(m)) return 'below-cost';
  if (hasDrift(m)) return 'drift';
  if (hasNoOfficial(m) || hasNoData(m)) return 'no-match';
  return 'normal';
}

/**
 * Classify and group models into 4 sections.
 * Returns { belowCost, drift, noMatch, normal } arrays.
 */
export function classifyAndGroup(models) {
  const belowCost = [];
  const drift = [];
  const noMatch = [];
  const normal = [];
  const belowCostKeys = new Set();
  const driftKeys = new Set();

  // Pass 1: below-cost
  for (const m of models) {
    if (hasBelowCost(m) || hasNotHighestTier(m)) {
      belowCost.push(m);
      belowCostKeys.add(`${m.provider}/${m.model}`);
    }
  }
  // Pass 2: drift
  for (const m of models) {
    const key = `${m.provider}/${m.model}`;
    if (!belowCostKeys.has(key) && hasDrift(m)) {
      drift.push(m);
      driftKeys.add(key);
    }
  }
  // Pass 3: no-match
  for (const m of models) {
    const key = `${m.provider}/${m.model}`;
    if (!belowCostKeys.has(key) && !driftKeys.has(key) && (hasNoOfficial(m) || hasNoData(m))) {
      noMatch.push(m);
    }
  }
  // Pass 4: normal (everything else)
  const usedKeys = new Set([...belowCostKeys, ...driftKeys, ...noMatch.map((m) => `${m.provider}/${m.model}`)]);
  for (const m of models) {
    if (!usedKeys.has(`${m.provider}/${m.model}`)) {
      normal.push(m);
    }
  }

  return { belowCost, drift, noMatch, normal };
}

/**
 * Recalculate classification from entry (cost data) + rate (sell data).
 * Used by client-side recategorization after DB refresh.
 */
export function classifyFromEntryAndRate(entry, rate, isNoOfficial) {
  const isUnit = entry.modelType === 'imageGeneration' || entry.modelType === 'video';
  const sI = rate.inputRate,
    sO = rate.outputRate;

  // Base cost = official/external price (before tiers)
  const baseCostI = entry.inputCostPerToken;
  const baseCostO = entry.outputCostPerToken;

  // Highest-tier cost for margin comparison (sell price vs max cost)
  const mc = getMarginCosts(entry);
  const cI = entry.bestCostInput || mc.input;
  const cO = entry.bestCostOutput || mc.output;
  const mI = !isUnit && cI ? ((sI - cI) / cI) * 100 : null;
  const mO = cO ? ((sO - cO) / cO) * 100 : null;
  const DTH = 2;

  // DB unitCosts for cost drift check (unitCost vs base official price)
  const dbUcI = rate.unitCosts?.input || 0;
  const dbUcO = rate.unitCosts?.output || 0;

  const ct = entry.cacheTiers || [];
  const wt = ct.filter(function (t) {
    return t.label.indexOf('write') >= 0;
  });
  const rc = entry.officialCacheRead || entry.litellmCacheRead || entry.cachedInputCostPerToken || 0;
  const mwc = wt.length
    ? Math.max(
        ...wt.map(function (t) {
          return t.costPerToken;
        })
      )
    : 0;
  const sCW = rate.cacheWriteRate || 0,
    sCR = rate.cacheReadRate || 0;

  // Below-cost check
  var bc = false;
  if (mO != null && mO < -DTH) bc = true;
  if (!isUnit && mI != null && mI < -DTH) bc = true;
  if (mwc > 0 && (!sCW || ((sCW - mwc) / mwc) * 100 < -DTH)) bc = true;
  if (rc > 0 && (!sCR || ((sCR - rc) / rc) * 100 < -DTH)) bc = true;

  // Not-highest-tier check
  var nht = false;
  if (entry.tieredPricing && entry.tieredPricing.length) {
    var hi = entry.tieredPricing[entry.tieredPricing.length - 1];
    if (!aboveOrClose(sO, hi.output) || (!isUnit && !aboveOrClose(sI, hi.input))) nht = true;
  }
  if (entry.resolutionTiers && entry.resolutionTiers.length) {
    var mx = Math.max(
      ...entry.resolutionTiers.map(function (t) {
        return t.costPerImage;
      })
    );
    if (!aboveOrClose(sO, mx)) nht = true;
  }
  if (wt.length > 1) {
    var mw = Math.max(
      ...wt.map(function (t) {
        return t.costPerToken;
      })
    );
    if (!aboveOrClose(sCW, mw)) nht = true;
  }

  if (bc || nht) return 'below-cost';

  // When sell price matches highest tier, drift against base price is expected — skip margin/cost drift.
  var sellMatchesTier = false;
  if (!nht && entry.tieredPricing && entry.tieredPricing.length > 0) {
    var hi = entry.tieredPricing[entry.tieredPricing.length - 1];
    if (aboveOrClose(sI, hi.input) && aboveOrClose(sO, hi.output)) sellMatchesTier = true;
  }

  // Drift check — sell margin drift
  var dr = false;
  if (!sellMatchesTier) {
    if (!isUnit && mI != null && Math.abs(mI) > DTH) dr = true;
    if (mO != null && Math.abs(mO) > DTH) dr = true;
  }
  if (mwc > 0 && sCW > 0 && Math.abs(((sCW - mwc) / mwc) * 100) > DTH) dr = true;
  if (rc > 0 && sCR > 0 && Math.abs(((sCR - rc) / rc) * 100) > DTH) dr = true;

  // Cost drift check — DB unitCosts vs base official/external price
  if (!sellMatchesTier) {
    if (!isUnit && baseCostI && dbUcI > 0) {
      var ucDriftI = Math.abs((dbUcI - baseCostI) / baseCostI) * 100;
      if (ucDriftI > 10) dr = true;
    }
    if (baseCostO && dbUcO > 0) {
      var ucDriftO = Math.abs((dbUcO - baseCostO) / baseCostO) * 100;
      if (ucDriftO > 10) dr = true;
    }
  }

  // Preserve initial drift classification from multi-source comparison (LiteLLM/OpenRouter/official).
  if (!dr && !sellMatchesTier && entry.initialMaxDrift > 0.1) {
    var ucUnchanged = true;
    if (baseCostI && dbUcI > 0 && Math.abs((dbUcI - baseCostI) / baseCostI) > 0.001) ucUnchanged = false;
    if (baseCostO && dbUcO > 0 && Math.abs((dbUcO - baseCostO) / baseCostO) > 0.001) ucUnchanged = false;
    if (ucUnchanged) dr = true;
  }

  if (dr) return 'drift';

  if (isNoOfficial) return 'no-match';
  return 'normal';
}

// ─── Type Priority & Compatibility ───────────────────────────────────────────

/**
 * Model type priority for base-key preference and lookup ordering.
 * Lower number = higher priority.
 * Standard (chatCompletion) > lexicon > ... > fineTuning (lowest)
 */
export const MODEL_TYPE_PRIORITY = {
  chatCompletion: 0,
  lexicon: 1,
  embedding: 2,
  imageGeneration: 3,
  video: 4,
  audio: 5,
  transcription: 6,
  tool: 7,
  fineTuning: 8,
};

/**
 * Get numeric priority for a model type (lower = higher priority).
 */
export function typePriority(type) {
  if (!type) return 99;
  return MODEL_TYPE_PRIORITY[type] ?? 50;
}

/**
 * Get equivalent type keys to try when the exact dbType has no match in cache.
 * e.g. lexicon → try chatCompletion; chatCompletion → no extra equivalents needed.
 */
export function getEquivalentTypes(dbType) {
  if (!dbType) return [];
  // lexicon should match chatCompletion pricing (standard inference), never fineTuning
  if (dbType === 'lexicon') return ['chatCompletion'];
  return [];
}

/**
 * Check if a cache entry's modelType is compatible with a DB rate's type.
 */
export function isTypeCompatible(dbType, cacheType) {
  if (!cacheType || !dbType) return true;
  if (dbType === cacheType) return true;
  // lexicon ↔ chatCompletion → compatible (lexicon uses standard pricing)
  if (
    (dbType === 'lexicon' && cacheType === 'chatCompletion') ||
    (dbType === 'chatCompletion' && cacheType === 'lexicon')
  )
    return true;
  // lexicon ↔ fineTuning → incompatible (lexicon should NOT use fineTuning pricing)
  if ((dbType === 'lexicon' && cacheType === 'fineTuning') || (dbType === 'fineTuning' && cacheType === 'lexicon'))
    return false;
  // chatCompletion ↔ fineTuning → incompatible
  if (
    (dbType === 'chatCompletion' && cacheType === 'fineTuning') ||
    (dbType === 'fineTuning' && cacheType === 'chatCompletion')
  )
    return false;
  // chatCompletion ↔ imageGeneration → incompatible
  if (
    (dbType === 'chatCompletion' && cacheType === 'imageGeneration') ||
    (dbType === 'imageGeneration' && cacheType === 'chatCompletion')
  )
    return false;
  // chatCompletion ↔ audio → incompatible
  if ((dbType === 'chatCompletion' && cacheType === 'audio') || (dbType === 'audio' && cacheType === 'chatCompletion'))
    return false;
  return true;
}

/**
 * Look up official pricing with type awareness and priority.
 *
 * Lookup order for a given key:
 *   1. Exact type match (key::dbType)
 *   2. Equivalent types (e.g. lexicon → key::chatCompletion)
 *   3. Base key (if type-compatible)
 * Then repeat for each fallback key.
 *
 * @param {Map} cache
 * @param {string} lookupKey
 * @param {string[]} fallbackKeys
 * @param {string} dbType
 */
export function lookupOfficialPricing(cache, lookupKey, fallbackKeys, dbType) {
  const equivalents = getEquivalentTypes(dbType);
  const allKeys = [lookupKey, ...fallbackKeys];

  for (const key of allKeys) {
    // 1. Exact type match
    if (dbType) {
      const typed = cache.get(`${key}::${dbType}`);
      if (typed) return typed;
    }
    // 2. Equivalent types (priority order)
    for (const eqType of equivalents) {
      const typed = cache.get(`${key}::${eqType}`);
      if (typed) return typed;
    }
    // 3. Base key (if compatible)
    const base = cache.get(key);
    if (base && isTypeCompatible(dbType, base.modelType)) return base;
  }
  return undefined;
}

// ─── Best Cost Selection ─────────────────────────────────────────────────────

/**
 * Select the best cost source and calculate margins.
 * Mutates `result` in place.
 */
export function pickBestCost(result) {
  if (result.pricingUnit === 'per-image' || result.pricingUnit === 'per-second') {
    if (result.pricingUnit === 'per-image' && result.resolutionTiers?.length) {
      result.bestCostOutput = Math.max(...result.resolutionTiers.map((t) => t.costPerImage));
    } else if (result.pricingUnit === 'per-image' && result.litellmOutputPerImage !== undefined) {
      result.bestCostOutput = result.litellmOutputPerImage;
    } else if (result.pricingUnit === 'per-second' && result.litellmOutputPerSecond !== undefined) {
      result.bestCostOutput = result.litellmOutputPerSecond;
    }

    if (result.pricingUnit === 'per-image' && result.providerPageOutput !== undefined && !result.bestCostOutput) {
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (
      result.pricingUnit === 'per-second' &&
      result.providerPageOutput !== undefined &&
      !result.bestCostOutput
    ) {
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    }

    if (result.pricingUnit === 'per-image' && result.litellmInputPerImage !== undefined) {
      result.bestCostInput = result.litellmInputPerImage;
      if (!result.bestCostSource) {
        result.bestCostSource = 'litellm';
        result.bestCostSourceLabel = 'LiteLLM';
      }
    } else if (result.providerPageInput !== undefined) {
      result.bestCostInput = result.providerPageInput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (result.openrouterInput !== undefined) {
      result.bestCostInput = result.openrouterInput;
      result.bestCostSource = 'openrouter';
      result.bestCostSourceLabel = 'OpenRouter';
    } else if (result.litellmInput !== undefined) {
      result.bestCostInput = result.litellmInput;
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
    if (result.bestCostOutput !== undefined && !result.bestCostSource) {
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
  } else {
    if (result.providerPageInput !== undefined && result.providerPageOutput !== undefined) {
      result.bestCostInput = result.providerPageInput;
      result.bestCostOutput = result.providerPageOutput;
      result.bestCostSource = 'provider-page';
      result.bestCostSourceLabel = '官方';
      result.bestCostUrl = result.providerPageUrl;
    } else if (result.openrouterInput !== undefined && result.openrouterOutput !== undefined) {
      result.bestCostInput = result.openrouterInput;
      result.bestCostOutput = result.openrouterOutput;
      result.bestCostSource = 'openrouter';
      result.bestCostSourceLabel = 'OpenRouter';
    } else if (result.litellmInput !== undefined && result.litellmOutput !== undefined) {
      result.bestCostInput = result.litellmInput;
      result.bestCostOutput = result.litellmOutput;
      result.bestCostSource = 'litellm';
      result.bestCostSourceLabel = 'LiteLLM';
    }
  }

  if (result.bestCostInput !== undefined && result.inputRate !== undefined && result.bestCostInput > 0) {
    result.inputMargin = ((result.inputRate - result.bestCostInput) / result.bestCostInput) * 100;
  }
  if (result.bestCostOutput !== undefined && result.outputRate !== undefined && result.bestCostOutput > 0) {
    result.outputMargin = ((result.outputRate - result.bestCostOutput) / result.bestCostOutput) * 100;
  }
}

// ─── Core Compare Engine ─────────────────────────────────────────────────────

/**
 * Compare DB rates against external sources and produce structured comparison results.
 * @param {Array} dbRates
 * @param {Map} litellm
 * @param {Map} openrouter
 * @param {Map} providerPages - official pricing cache
 * @param {number} threshold
 * @returns {Array} ComparisonResult[]
 */
export function compare(dbRates, litellm, openrouter, providerPages, threshold) {
  const results = [];

  for (const rate of dbRates) {
    const providerName = rate.provider?.name || '';
    const lookupKey = providerName === 'openrouter' ? rate.model : `${providerName}/${rate.model}`;
    const dbInput = Number(rate.unitCosts?.input ?? rate.inputRate ?? 0);
    const dbOutput = Number(rate.unitCosts?.output ?? rate.outputRate ?? 0);

    const modelFallbacks = modelNameFallbacks(rate.model);
    const fallbackKeys = modelFallbacks.map((m) => (providerName === 'openrouter' ? m : `${providerName}/${m}`));

    // LiteLLM lookup with fallbacks
    let ll = litellm.get(lookupKey);
    if (!ll && providerName === 'openrouter') {
      ll = litellm.get(`openrouter/${rate.model}`);
    }
    if (!ll) {
      const modelOnly = rate.model;
      for (const tryProvider of ['openai', 'anthropic', 'google', 'gemini', 'deepseek', 'xai']) {
        const found = litellm.get(`${tryProvider}/${modelOnly}`);
        if (found) {
          ll = found;
          break;
        }
      }
    }
    if (!ll) {
      for (const fbKey of fallbackKeys) {
        ll = litellm.get(fbKey);
        if (ll) break;
      }
      if (!ll) {
        for (const fbModel of modelFallbacks) {
          for (const tryProvider of ['openai', 'anthropic', 'google', 'gemini', 'deepseek', 'xai']) {
            ll = litellm.get(`${tryProvider}/${fbModel}`);
            if (ll) break;
          }
          if (ll) break;
        }
      }
    }

    const or = openrouter.get(lookupKey) ?? fallbackKeys.reduce((found, k) => found ?? openrouter.get(k), undefined);

    const pp = lookupOfficialPricing(providerPages, lookupKey, fallbackKeys, rate.type);

    const pricingUnit =
      rate.type === 'imageGeneration' ? 'per-image' : rate.type === 'video' ? 'per-second' : 'per-token';
    const isPerUnit = pricingUnit !== 'per-token';

    let maxDrift = 0;
    const result = {
      provider: providerName,
      model: rate.model,
      type: rate.type,
      pricingUnit,
      dbInput,
      dbOutput,
      maxDrift: 0,
      exceedsThreshold: false,
      hasPricingIssue: false,
    };

    if (ll) {
      result.litellmInput = ll.inputCostPerToken;
      result.litellmOutput = ll.outputCostPerToken;
      if (ll.tieredPricing) result.tieredPricing = ll.tieredPricing;
      if (ll.resolutionTiers) result.resolutionTiers = ll.resolutionTiers;

      if (
        pricingUnit === 'per-image' &&
        !result.resolutionTiers &&
        ll.outputCostPerImage != null &&
        ll.outputCostPerImageToken != null
      ) {
        const derived = deriveResolutionTiers(ll.outputCostPerImage, ll.outputCostPerImageToken);
        if (derived) result.resolutionTiers = derived;
      }

      if (pricingUnit === 'per-image') {
        const llOutputPerImage = ll.outputCostPerImage ?? ll.inputCostPerImage;
        if (ll.inputCostPerImage !== undefined) result.litellmInputPerImage = ll.inputCostPerImage;
        if (llOutputPerImage !== undefined) {
          result.litellmOutputPerImage = llOutputPerImage;
          const outputDrift = calcDrift(dbOutput, llOutputPerImage);
          const inputDrift =
            ll.inputCostPerToken !== undefined && dbInput > 0 ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
          result.litellmDrift = Math.max(inputDrift, outputDrift);
        } else {
          const inputDrift = ll.inputCostPerToken !== undefined ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
          result.litellmDrift = inputDrift;
        }
      } else if (pricingUnit === 'per-second') {
        const llOutputPerSecond = ll.outputCostPerVideoPerSecond;
        if (llOutputPerSecond !== undefined) {
          result.litellmOutputPerSecond = llOutputPerSecond;
          result.litellmDrift = calcDrift(dbOutput, llOutputPerSecond);
        } else {
          result.litellmDrift = 0;
        }
      } else {
        const inputDrift = ll.inputCostPerToken !== undefined ? calcDrift(dbInput, ll.inputCostPerToken) : 0;
        const outputDrift = ll.outputCostPerToken !== undefined ? calcDrift(dbOutput, ll.outputCostPerToken) : 0;
        result.litellmDrift = Math.max(inputDrift, outputDrift);
      }
      if (result.litellmDrift !== undefined) {
        maxDrift = Math.max(maxDrift, result.litellmDrift);
      }
    }

    if (or && or.inputCostPerToken !== undefined && or.outputCostPerToken !== undefined) {
      const inputDrift = calcDrift(dbInput, or.inputCostPerToken);
      result.openrouterInput = or.inputCostPerToken;
      result.openrouterOutput = or.outputCostPerToken;
      if (isPerUnit) {
        result.openrouterDrift = inputDrift;
      } else {
        const outputDrift = calcDrift(dbOutput, or.outputCostPerToken);
        result.openrouterDrift = Math.max(inputDrift, outputDrift);
      }
      maxDrift = Math.max(maxDrift, result.openrouterDrift);
    }

    const dbCacheWrite = rate.caching ? Number(rate.caching.writeRate ?? 0) : 0;
    const dbCacheRead = rate.caching ? Number(rate.caching.readRate ?? 0) : 0;

    if (pp) {
      if (pricingUnit === 'per-image' && pp.costPerImage != null) {
        result.providerPageOutput = pp.costPerImage;
        result.providerPageDrift = calcDrift(dbOutput, pp.costPerImage);
        result.providerPageUrl = pp.sourceUrl;
        maxDrift = Math.max(maxDrift, result.providerPageDrift);
      } else if (pricingUnit === 'per-second' && pp.costPerSecond != null) {
        result.providerPageOutput = pp.costPerSecond;
        result.providerPageDrift = calcDrift(dbOutput, pp.costPerSecond);
        result.providerPageUrl = pp.sourceUrl;
        maxDrift = Math.max(maxDrift, result.providerPageDrift);
      } else if (pp.inputCostPerToken != null && pp.outputCostPerToken != null) {
        const inputDrift = calcDrift(dbInput, pp.inputCostPerToken);
        result.providerPageInput = pp.inputCostPerToken;
        result.providerPageOutput = pp.outputCostPerToken;
        if (isPerUnit) {
          result.providerPageDrift = inputDrift;
        } else {
          const outputDrift = calcDrift(dbOutput, pp.outputCostPerToken);
          result.providerPageDrift = Math.max(inputDrift, outputDrift);
        }
        result.providerPageUrl = pp.sourceUrl;
        maxDrift = Math.max(maxDrift, result.providerPageDrift);
      } else if (pp.inputCostPerToken != null || pp.outputCostPerToken != null) {
        result.providerPageInput = pp.inputCostPerToken;
        result.providerPageOutput = pp.outputCostPerToken;
        result.providerPageUrl = pp.sourceUrl;
        if (pp.outputCostPerToken != null) {
          result.providerPageDrift = calcDrift(dbOutput, pp.outputCostPerToken);
          maxDrift = Math.max(maxDrift, result.providerPageDrift);
        }
      }

      if (pp.cacheTiers?.length) {
        result.officialCacheTiers = pp.cacheTiers;
        const readTiers = pp.cacheTiers.filter((t) => t.label === 'read' || t.label === 'cached-input');
        const writeTiers = pp.cacheTiers.filter((t) => t.label.includes('write'));
        const maxWriteCost = writeTiers.length > 0 ? Math.max(...writeTiers.map((t) => t.costPerToken)) : 0;
        const maxReadCost = readTiers.length > 0 ? Math.max(...readTiers.map((t) => t.costPerToken)) : 0;
        if (maxWriteCost > 0) result.officialCacheWrite = maxWriteCost;
        if (maxReadCost > 0) result.officialCacheRead = maxReadCost;
      } else if (pp.cachedInputCostPerToken !== undefined) {
        result.officialCacheRead = pp.cachedInputCostPerToken;
      }
    }

    if (dbCacheWrite > 0 || dbCacheRead > 0) {
      result.dbCacheWrite = dbCacheWrite;
      result.dbCacheRead = dbCacheRead;
    }
    if (ll && (ll.cacheWriteCostPerToken !== undefined || ll.cacheReadCostPerToken !== undefined)) {
      result.litellmCacheWrite = ll.cacheWriteCostPerToken;
      result.litellmCacheRead = ll.cacheReadCostPerToken;

      // Use LiteLLM cache drift for dimensions NOT covered by official cache tiers.
      // Official tiers may only have 'read' — in that case, still use LiteLLM for write drift.
      const officialHasWrite = (result.officialCacheTiers ?? []).some((t) => t.label.includes('write'));
      const officialHasRead = (result.officialCacheTiers ?? []).some(
        (t) => t.label === 'read' || t.label === 'cached-input'
      );
      let cDrift = 0;
      if (
        !officialHasWrite &&
        dbCacheWrite > 0 &&
        ll.cacheWriteCostPerToken !== undefined &&
        ll.cacheWriteCostPerToken > 0
      ) {
        cDrift = Math.max(cDrift, calcDrift(dbCacheWrite, ll.cacheWriteCostPerToken));
      }
      if (
        !officialHasRead &&
        dbCacheRead > 0 &&
        ll.cacheReadCostPerToken !== undefined &&
        ll.cacheReadCostPerToken > 0
      ) {
        cDrift = Math.max(cDrift, calcDrift(dbCacheRead, ll.cacheReadCostPerToken));
      }
      if (cDrift > 0) {
        result.cacheDrift = cDrift;
        maxDrift = Math.max(maxDrift, cDrift);
      }
    }

    if (result.tieredPricing?.length && pricingUnit === 'per-token') {
      const maxTierInput = Math.max(...result.tieredPricing.map((t) => t.input ?? 0));
      const maxTierOutput = Math.max(...result.tieredPricing.map((t) => t.output ?? 0));
      if (maxTierInput > dbInput && dbInput > 0) {
        result.tierMaxInput = maxTierInput;
        result.tierInputDrift = calcDrift(dbInput, maxTierInput);
        // Note: tier drift is NOT added to maxDrift — it is handled by hasNotHighestTier classification
      }
      if (maxTierOutput > dbOutput && dbOutput > 0) {
        result.tierMaxOutput = maxTierOutput;
        result.tierOutputDrift = calcDrift(dbOutput, maxTierOutput);
      }
    }

    if (result.officialCacheTiers?.length) {
      const writeTiers = result.officialCacheTiers.filter((t) => t.label.includes('write'));
      const readTiers = result.officialCacheTiers.filter((t) => t.label === 'read' || t.label === 'cached-input');

      if (writeTiers.length > 0) {
        const maxWriteCost = Math.max(...writeTiers.map((t) => t.costPerToken));
        if (dbCacheWrite > 0 && dbCacheWrite < maxWriteCost) {
          const drift = calcDrift(dbCacheWrite, maxWriteCost);
          if (drift > 1e-6) {
            result.cacheTierMaxWrite = maxWriteCost;
            result.cacheTierWriteDrift = drift;
            maxDrift = Math.max(maxDrift, drift);
          }
        } else if ((dbCacheWrite === 0 || dbCacheWrite === undefined) && maxWriteCost > 0) {
          result.cacheTierMaxWrite = maxWriteCost;
          result.cacheTierWriteDrift = 1;
          maxDrift = Math.max(maxDrift, 1);
        }
      }

      if (readTiers.length > 0) {
        const maxReadCost = Math.max(...readTiers.map((t) => t.costPerToken));
        if (dbCacheRead > 0 && dbCacheRead < maxReadCost) {
          const drift = calcDrift(dbCacheRead, maxReadCost);
          if (drift > 1e-6) {
            result.cacheTierMaxRead = maxReadCost;
            result.cacheTierReadDrift = drift;
            maxDrift = Math.max(maxDrift, drift);
          }
        } else if ((dbCacheRead === 0 || dbCacheRead === undefined) && maxReadCost > 0) {
          result.cacheTierMaxRead = maxReadCost;
          result.cacheTierReadDrift = 1;
          maxDrift = Math.max(maxDrift, 1);
        }
      }
    }

    result.maxDrift = maxDrift;
    result.exceedsThreshold = maxDrift > threshold;

    if (rate.unitCosts && (rate.inputRate || rate.outputRate)) {
      const unitInputCost = Number(rate.unitCosts.input);
      const unitOutputCost = Number(rate.unitCosts.output);
      const inputRate = Number(rate.inputRate ?? 0);
      const outputRate = Number(rate.outputRate ?? 0);
      result.inputRate = inputRate;
      result.outputRate = outputRate;
      if (unitInputCost > 0 && inputRate > 0) {
        result.inputRateIssue = ((inputRate - unitInputCost) / unitInputCost) * 100;
      }
      if (unitOutputCost > 0 && outputRate > 0) {
        result.outputRateIssue = ((outputRate - unitOutputCost) / unitOutputCost) * 100;
      }
      const PRICING_TOLERANCE = 2;
      result.hasPricingIssue =
        (result.inputRateIssue !== undefined && Math.abs(result.inputRateIssue) > PRICING_TOLERANCE) ||
        (result.outputRateIssue !== undefined && Math.abs(result.outputRateIssue) > PRICING_TOLERANCE);
    } else {
      result.hasPricingIssue = false;
    }

    pickBestCost(result);

    // When sell price matches the highest tier, drift against base price is expected — not an error.
    // Recalculate drift and margin against the highest tier values.
    if (result.tieredPricing?.length && pricingUnit === 'per-token') {
      const hi = result.tieredPricing[result.tieredPricing.length - 1];
      const sI = result.inputRate ?? dbInput;
      const sO = result.outputRate ?? dbOutput;
      if (aboveOrClose(sI, hi.input) && aboveOrClose(sO, hi.output)) {
        // Recalculate source drift against highest tier
        if (result.litellmInput !== undefined)
          result.litellmDrift = Math.max(calcDrift(sI, hi.input), calcDrift(sO, hi.output));
        if (result.providerPageInput !== undefined)
          result.providerPageDrift = Math.max(calcDrift(sI, hi.input), calcDrift(sO, hi.output));
        if (result.openrouterInput !== undefined)
          result.openrouterDrift = Math.max(calcDrift(sI, hi.input), calcDrift(sO, hi.output));
        // Recalculate margin against highest tier
        if (hi.input > 0) result.inputMargin = ((sI - hi.input) / hi.input) * 100;
        if (hi.output > 0) result.outputMargin = ((sO - hi.output) / hi.output) * 100;
        // Recalculate maxDrift excluding tier-inflated values
        result.maxDrift = Math.max(
          result.litellmDrift ?? 0,
          result.openrouterDrift ?? 0,
          result.providerPageDrift ?? 0,
          result.cacheDrift ?? 0,
          result.cacheTierWriteDrift ?? 0,
          result.cacheTierReadDrift ?? 0
        );
        result.exceedsThreshold = result.maxDrift > threshold;
      }
    }

    results.push(result);
  }

  results.sort((a, b) => b.maxDrift - a.maxDrift);
  return results;
}

// ─── Unmatched Official Models (Reverse Lookup) ──────────────────────────────

/**
 * Find official pricing entries that exist in the cache but have no corresponding DB model.
 * Models must also exist in LiteLLM data to be included (dual-source confirmation).
 */
export function findUnmatchedOfficialModels(dbRates, officialCache, litellm) {
  const tier2Set = new Set(PROVIDER_TIERS.tier2);
  const relevantProviders = new Set();
  const matchedKeys = new Set();
  const LITELLM_PROVIDERS = ['openai', 'anthropic', 'google', 'gemini', 'deepseek', 'xai'];

  for (const rate of dbRates) {
    const providerName = rate.provider?.name || '';
    const { primaryProvider, primaryModel } = resolveModelMapping(rate.model, providerName);
    if (!tier2Set.has(primaryProvider)) {
      relevantProviders.add(primaryProvider);
    }
    const baseKey = `${primaryProvider}/${primaryModel}`;
    matchedKeys.add(baseKey);
    const fallbacks = modelNameFallbacks(primaryModel);
    for (const fb of fallbacks) {
      matchedKeys.add(`${primaryProvider}/${fb}`);
    }
    if (providerName && providerName !== primaryProvider) {
      matchedKeys.add(`${providerName}/${rate.model}`);
    }
  }

  function lookupLiteLLM(provider, modelId) {
    let ll = litellm.get(`${provider}/${modelId}`);
    if (ll) return ll;
    for (const tryProv of LITELLM_PROVIDERS) {
      const norm = normalizeProvider(tryProv);
      if (norm === provider || tryProv === provider) {
        ll = litellm.get(`${tryProv}/${modelId}`);
        if (ll) return ll;
      }
    }
    const fallbacks = modelNameFallbacks(modelId);
    for (const fb of fallbacks) {
      ll = litellm.get(`${provider}/${fb}`);
      if (ll) return ll;
      for (const tryProv of LITELLM_PROVIDERS) {
        const norm = normalizeProvider(tryProv);
        if (norm === provider || tryProv === provider) {
          ll = litellm.get(`${tryProv}/${fb}`);
          if (ll) return ll;
        }
      }
    }
    return undefined;
  }

  const unmatched = [];
  for (const [key, entry] of officialCache) {
    if (key.includes('::')) continue;
    if (!relevantProviders.has(entry.provider)) continue;
    if (matchedKeys.has(key)) continue;
    const ll = lookupLiteLLM(entry.provider, entry.modelId);
    if (!ll) continue;
    unmatched.push({
      ...entry,
      litellmInput: ll.inputCostPerToken,
      litellmOutput: ll.outputCostPerToken,
      litellmCacheWrite: ll.cacheWriteCostPerToken,
      litellmCacheRead: ll.cacheReadCostPerToken,
    });
  }
  return unmatched;
}

// ─── Official Pricing Cache Builder ──────────────────────────────────────────

/**
 * Build a Map from an OfficialPricingCache entries array.
 * Same logic as loadOfficialPricingCache in fetch-sources.ts.
 */
export function buildOfficialPricingMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    const id = entry.modelId || entry.model;
    if (!id) continue;
    const baseKey = `${entry.provider}/${id}`;
    if (entry.modelType) {
      map.set(`${baseKey}::${entry.modelType}`, entry);
    }
    // For the base key, prefer higher-priority types (chatCompletion > lexicon > ... > fineTuning)
    const existing = map.get(baseKey);
    if (!existing || typePriority(entry.modelType) < typePriority(existing.modelType)) {
      map.set(baseKey, entry);
    }
  }
  return map;
}
