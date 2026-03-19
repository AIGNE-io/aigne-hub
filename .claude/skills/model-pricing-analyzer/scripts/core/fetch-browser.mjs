/**
 * Browser-side Data Fetchers — uses native fetch() API.
 *
 * Rules:
 * - Pure .mjs — no external dependencies
 * - Expects pricing-core.mjs functions to be available in scope (inlined before this)
 * - All functions use `export function` syntax (stripped when inlined)
 */

// ─── Mount Point Detection ───────────────────────────────────────────────────

const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';
var __mountPointCache = {};

/**
 * Detect blocklet mount point from __blocklet__.js (browser-side).
 * Caches per origin to avoid repeated requests.
 */
export async function detectMountPointBrowser(hubUrl) {
  try {
    var origin = new URL(hubUrl).origin;
    if (__mountPointCache[origin] !== undefined) return __mountPointCache[origin];
    var resp = await fetch(origin + '/__blocklet__.js?type=json&owner=1&nocache=1');
    if (!resp.ok) {
      __mountPointCache[origin] = '/';
      return '/';
    }
    var data = await resp.json();
    if (data.componentMountPoints && Array.isArray(data.componentMountPoints)) {
      var hub = data.componentMountPoints.find(function (c) {
        return c.did === AIGNE_HUB_DID;
      });
      if (hub && hub.mountPoint) {
        __mountPointCache[origin] = hub.mountPoint;
        return hub.mountPoint;
      }
    }
    __mountPointCache[origin] = '/';
    return '/';
  } catch (e) {
    __mountPointCache[origin] = '/';
    return '/';
  }
}

/**
 * Build API URL with correct mount point (browser-side).
 */
export async function buildApiUrlBrowser(hubUrl, apiPath) {
  var origin = new URL(hubUrl).origin;
  var mp = await detectMountPointBrowser(hubUrl);
  if (mp === '/') return origin + apiPath;
  return origin + mp.replace(/\/$/, '') + apiPath;
}

// ─── Hub DB Rates ────────────────────────────────────────────────────────────

/**
 * Fetch DB rates from Hub API (paginated).
 * @param {string} hubUrl - Hub base URL
 * @param {string} [token] - Auth token (optional for read)
 * @returns {Promise<Array>} DbRate-like objects
 */
export async function fetchDbRatesBrowser(hubUrl, token) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const all = [];
  let page = 1;
  const apiBase = await buildApiUrlBrowser(hubUrl, '/api/ai-providers/model-rates');
  while (true) {
    const resp = await fetch(apiBase + '?pageSize=100&page=' + page + '&includeDeprecated=true', { headers });
    if (!resp.ok) {
      const txt = await resp.text().catch(function () {
        return resp.statusText;
      });
      throw new Error('DB rates: HTTP ' + resp.status + ': ' + txt.slice(0, 200));
    }
    const data = await resp.json();
    const list = data.list || data.data?.list || [];
    all.push(...list);
    if (list.length < 100) break;
    page++;
  }
  return all;
}

// ─── LiteLLM ─────────────────────────────────────────────────────────────────

const LITELLM_RAW_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/**
 * Fetch LiteLLM pricing data and build a Map<string, ExternalRate>.
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchLiteLLMBrowser() {
  const map = new Map();
  const resolutionVariants = new Map();

  const resp = await fetch(LITELLM_RAW_URL);
  if (!resp.ok) throw new Error('LiteLLM: HTTP ' + resp.status);
  const data = await resp.json();

  for (const [key, val] of Object.entries(data)) {
    if (key === 'sample_spec') continue;

    // Resolution variant keys
    const resMatch = key.match(/^(?:azure\/)?(\w+)\/([\dx-]+)\/(.+)$/);
    if (resMatch && val.mode === 'image_generation') {
      const [, quality, sizeRaw, baseModel] = resMatch;
      const size = sizeRaw.replace(/-/g, '');
      const cost =
        (val.input_cost_per_image ?? val.output_cost_per_image ?? val.input_cost_per_pixel)
          ? (val.input_cost_per_pixel || 0) * sizeRaw.split('-x-').reduce((a, b) => a * parseInt(b), 1)
          : undefined;
      if (cost !== undefined) {
        const litellmProvider = val.litellm_provider || '';
        const normalizedProv = normalizeProvider(litellmProvider) || litellmProvider;
        const baseKey = normalizedProv + '/' + baseModel;
        if (!resolutionVariants.has(baseKey)) resolutionVariants.set(baseKey, []);
        resolutionVariants.get(baseKey).push({ quality, size, costPerImage: cost });
      }
      continue;
    }

    let hasAnyPricing = false;
    const rate = {};

    if (val.input_cost_per_token !== undefined) {
      rate.inputCostPerToken = val.input_cost_per_token;
      hasAnyPricing = true;
    }
    if (val.output_cost_per_token !== undefined) {
      rate.outputCostPerToken = val.output_cost_per_token;
      hasAnyPricing = true;
    }
    if (val.cache_creation_input_token_cost !== undefined)
      rate.cacheWriteCostPerToken = val.cache_creation_input_token_cost;
    if (val.cache_read_input_token_cost !== undefined) rate.cacheReadCostPerToken = val.cache_read_input_token_cost;
    if (val.output_cost_per_image !== undefined) {
      rate.outputCostPerImage = val.output_cost_per_image;
      hasAnyPricing = true;
    }
    if (val.input_cost_per_image !== undefined) {
      rate.inputCostPerImage = val.input_cost_per_image;
      hasAnyPricing = true;
    }
    if (val.input_cost_per_image_token !== undefined) {
      rate.inputCostPerImageToken = val.input_cost_per_image_token;
      hasAnyPricing = true;
    }
    if (val.output_cost_per_image_token !== undefined) {
      rate.outputCostPerImageToken = val.output_cost_per_image_token;
      hasAnyPricing = true;
    }
    if (val.output_cost_per_video_per_second !== undefined) {
      rate.outputCostPerVideoPerSecond = val.output_cost_per_video_per_second;
      hasAnyPricing = true;
    } else if (val.output_cost_per_second !== undefined && val.mode === 'video_generation') {
      rate.outputCostPerVideoPerSecond = val.output_cost_per_second;
      hasAnyPricing = true;
    }

    // Tiered pricing
    const tiers = [];
    for (const tierKey of Object.keys(val)) {
      const tierMatch = tierKey.match(/^(input|output)_cost_per_token_above_(\d+k)_tokens$/);
      if (tierMatch) {
        const [, direction, threshold] = tierMatch;
        let existing = tiers.find((t) => t.threshold === threshold);
        if (!existing) {
          existing = { threshold };
          tiers.push(existing);
        }
        if (direction === 'input') existing.input = val[tierKey];
        else existing.output = val[tierKey];
      }
    }
    if (tiers.length > 0) rate.tieredPricing = tiers;

    if (!hasAnyPricing) continue;

    const litellmProvider = val.litellm_provider || '';
    const parts = key.split('/');
    const modelName = parts.length > 1 ? parts.slice(1).join('/') : key;

    map.set(litellmProvider + '/' + modelName, rate);

    const normalizedProv = normalizeProvider(litellmProvider);
    if (normalizedProv && normalizedProv !== litellmProvider) {
      const normalizedKey = normalizedProv + '/' + modelName;
      if (!map.has(normalizedKey)) map.set(normalizedKey, rate);
    }

    if (litellmProvider === 'openrouter' && key.startsWith('openrouter/')) {
      map.set(key, rate);
    }
  }

  // Merge resolution variants
  for (const [baseKey, variants] of resolutionVariants) {
    const existing = map.get(baseKey);
    if (existing) existing.resolutionTiers = variants;
    for (const [k, v] of map) {
      if (k.endsWith('/' + baseKey.split('/').pop()) && !v.resolutionTiers) {
        v.resolutionTiers = variants;
      }
    }
  }

  return map;
}

// ─── OpenRouter ──────────────────────────────────────────────────────────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Fetch OpenRouter pricing data.
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchOpenRouterBrowser() {
  const map = new Map();
  const resp = await fetch(OPENROUTER_API_URL);
  if (!resp.ok) throw new Error('OpenRouter: HTTP ' + resp.status);
  const json = await resp.json();
  const models = json.data || [];

  for (const model of models) {
    if (!model.pricing?.prompt || !model.pricing?.completion) continue;
    const slashIdx = model.id.indexOf('/');
    if (slashIdx === -1) continue;
    const prefix = model.id.substring(0, slashIdx);
    const modelName = model.id.substring(slashIdx + 1);
    const provider = normalizeProvider(prefix) || prefix;
    const input = parseFloat(model.pricing.prompt);
    const output = parseFloat(model.pricing.completion);
    if (!isNaN(input) && !isNaN(output)) {
      const rate = { inputCostPerToken: input, outputCostPerToken: output };
      map.set(provider + '/' + modelName, rate);
      if (provider !== prefix) {
        map.set(prefix + '/' + modelName, rate);
      }
    }
  }
  return map;
}

// ─── Official Pricing (JSON file) ────────────────────────────────────────────

/**
 * Load official pricing from a URL or embedded data.
 * @param {string|object} source - URL string or already-parsed data object
 * @returns {Promise<{entries: Array, timestamp: number}|null>}
 */
export async function loadOfficialPricingBrowser(source) {
  if (!source) return null;
  if (typeof source === 'object') return source;
  try {
    const resp = await fetch(source);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}
