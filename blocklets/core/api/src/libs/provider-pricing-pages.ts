import axios from 'axios';

import logger from './logger';

export interface ProviderPagePricing {
  provider: string;
  model: string;
  inputCostPerToken?: number;
  outputCostPerToken?: number;
  source: 'provider_page';
  url: string;
}

interface ProviderPageConfig {
  url: string;
  extractPricing: (html: string) => ProviderPagePricing[];
}

/**
 * Provider pricing page configurations.
 * Each provider has a URL and a best-effort HTML extraction function.
 * These are intentionally simple — HTML parsing is fragile,
 * so we accept null results gracefully.
 */
const PROVIDER_PAGES: Record<string, ProviderPageConfig> = {
  openai: {
    url: 'https://openai.com/api/pricing/',
    extractPricing: (html: string): ProviderPagePricing[] => {
      try {
        const results: ProviderPagePricing[] = [];

        // OpenAI pricing page patterns (updated for current page structure)
        // Pattern: model name followed by pricing table with "Input" and "Output" costs per 1M tokens
        const modelPatterns = [
          { name: 'gpt-4o', patterns: [/gpt-4o[^-]/i, /GPT-4o[^-]/] },
          { name: 'gpt-4o-mini', patterns: [/gpt-4o-mini/i, /GPT-4o mini/i] },
          { name: 'gpt-3.5-turbo', patterns: [/gpt-3\.5-turbo/i, /GPT-3\.5 Turbo/i] },
          { name: 'gpt-4-turbo', patterns: [/gpt-4-turbo/i, /GPT-4 Turbo/i] },
        ];

        for (const { name, patterns } of modelPatterns) {
          // Try to find pricing near model name
          // Look for patterns like "$X.XX / 1M tokens" for input and output
          for (const pattern of patterns) {
            const modelSection = html.match(new RegExp(`${pattern.source}[\\s\\S]{0,500}`, 'i'));
            if (modelSection) {
              const section = modelSection[0];
              // Match pricing patterns: $5.00 / 1M or $0.150 / 1M
              const prices = section.match(/\$?([\d.]+)\s*\/\s*1M/gi);
              if (prices && prices.length >= 2 && prices[0] && prices[1]) {
                const inputPrice = parseFloat(prices[0].replace(/[^0-9.]/g, ''));
                const outputPrice = parseFloat(prices[1].replace(/[^0-9.]/g, ''));

                if (!Number.isNaN(inputPrice) && !Number.isNaN(outputPrice)) {
                  results.push({
                    provider: 'openai',
                    model: name,
                    inputCostPerToken: inputPrice / 1000000,
                    outputCostPerToken: outputPrice / 1000000,
                    source: 'provider_page',
                    url: 'https://openai.com/api/pricing/',
                  });
                  break;
                }
              }
            }
          }
        }

        return results;
      } catch (err) {
        logger.warn(`OpenAI pricing extraction failed: ${err instanceof Error ? err.message : 'unknown'}`);
        return [];
      }
    },
  },
  anthropic: {
    url: 'https://docs.anthropic.com/en/docs/about-claude/models',
    extractPricing: (html: string): ProviderPagePricing[] => {
      try {
        const results: ProviderPagePricing[] = [];

        // Anthropic pricing patterns
        const modelPatterns = [
          { name: 'claude-3-5-sonnet-20241022', aliases: ['claude-3.5-sonnet', 'Claude 3.5 Sonnet'] },
          { name: 'claude-3-5-haiku-20241022', aliases: ['claude-3.5-haiku', 'Claude 3.5 Haiku'] },
          { name: 'claude-opus-4', aliases: ['claude-opus-4', 'Claude Opus 4'] },
          { name: 'claude-3-opus-20240229', aliases: ['claude-3-opus', 'Claude 3 Opus'] },
        ];

        for (const { name, aliases } of modelPatterns) {
          for (const alias of aliases) {
            // Look for pricing in table format: model name with input/output pricing
            const regex = new RegExp(`${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,500}`, 'i');
            const modelSection = html.match(regex);

            if (modelSection) {
              const section = modelSection[0];
              // Match pricing: $X.XX / MTok or per million tokens
              const prices = section.match(/\$?([\d.]+)\s*(?:\/|per)\s*(?:1M|MTok|million)/gi);

              if (prices && prices.length >= 2 && prices[0] && prices[1]) {
                const inputPrice = parseFloat(prices[0].replace(/[^0-9.]/g, ''));
                const outputPrice = parseFloat(prices[1].replace(/[^0-9.]/g, ''));

                if (!Number.isNaN(inputPrice) && !Number.isNaN(outputPrice)) {
                  results.push({
                    provider: 'anthropic',
                    model: name,
                    inputCostPerToken: inputPrice / 1000000,
                    outputCostPerToken: outputPrice / 1000000,
                    source: 'provider_page',
                    url: 'https://docs.anthropic.com/en/docs/about-claude/models',
                  });
                  break;
                }
              }
            }
          }
        }

        return results;
      } catch (err) {
        logger.warn(`Anthropic pricing extraction failed: ${err instanceof Error ? err.message : 'unknown'}`);
        return [];
      }
    },
  },
  google: {
    url: 'https://ai.google.dev/pricing',
    extractPricing: (html: string): ProviderPagePricing[] => {
      try {
        const results: ProviderPagePricing[] = [];

        // Google AI pricing patterns
        const modelPatterns = [
          { name: 'gemini-2.0-flash-exp', aliases: ['Gemini 2.0 Flash', 'gemini-2.0-flash'] },
          { name: 'gemini-1.5-pro', aliases: ['Gemini 1.5 Pro'] },
          { name: 'gemini-1.5-flash', aliases: ['Gemini 1.5 Flash'] },
        ];

        for (const { name, aliases } of modelPatterns) {
          for (const alias of aliases) {
            const regex = new RegExp(`${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,500}`, 'i');
            const modelSection = html.match(regex);

            if (modelSection) {
              const section = modelSection[0];
              // Google uses various formats: "$X / 1 million tokens"
              const prices = section.match(/\$?([\d.]+)\s*(?:\/|per)\s*(?:1\s*million|million|1M)/gi);

              if (prices && prices.length >= 2 && prices[0] && prices[1]) {
                const inputPrice = parseFloat(prices[0].replace(/[^0-9.]/g, ''));
                const outputPrice = parseFloat(prices[1].replace(/[^0-9.]/g, ''));

                if (!Number.isNaN(inputPrice) && !Number.isNaN(outputPrice)) {
                  results.push({
                    provider: 'google',
                    model: name,
                    inputCostPerToken: inputPrice / 1000000,
                    outputCostPerToken: outputPrice / 1000000,
                    source: 'provider_page',
                    url: 'https://ai.google.dev/pricing',
                  });
                  break;
                }
              }
            }
          }
        }

        return results;
      } catch (err) {
        logger.warn(`Google pricing extraction failed: ${err instanceof Error ? err.message : 'unknown'}`);
        return [];
      }
    },
  },
  deepseek: {
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    extractPricing: (html: string): ProviderPagePricing[] => {
      try {
        const results: ProviderPagePricing[] = [];

        // Extract pricing from table: "1M INPUT TOKENS (CACHE MISS)" and "1M OUTPUT TOKENS"
        const inputMatch = html.match(/1M INPUT TOKENS \(CACHE MISS\)<\/td><td[^>]*>\$?([\d.]+)/i);
        const outputMatch = html.match(/1M OUTPUT TOKENS<\/td><td[^>]*>\$?([\d.]+)/i);

        if (inputMatch?.[1] && outputMatch?.[1]) {
          const inputPerMillion = parseFloat(inputMatch[1]);
          const outputPerMillion = parseFloat(outputMatch[1]);

          // Convert per-1M to per-token
          const inputCostPerToken = inputPerMillion / 1000000;
          const outputCostPerToken = outputPerMillion / 1000000;

          // DeepSeek has two models: deepseek-chat and deepseek-reasoner (same pricing)
          results.push({
            provider: 'deepseek',
            model: 'deepseek-chat',
            inputCostPerToken,
            outputCostPerToken,
            source: 'provider_page',
            url: 'https://api-docs.deepseek.com/quick_start/pricing',
          });

          results.push({
            provider: 'deepseek',
            model: 'deepseek-reasoner',
            inputCostPerToken,
            outputCostPerToken,
            source: 'provider_page',
            url: 'https://api-docs.deepseek.com/quick_start/pricing',
          });
        }

        return results;
      } catch (err) {
        logger.warn(`DeepSeek pricing extraction failed: ${err instanceof Error ? err.message : 'unknown'}`);
        return [];
      }
    },
  },
  xai: {
    url: 'https://docs.x.ai/docs/models#models-and-pricing',
    extractPricing: (html: string): ProviderPagePricing[] => {
      try {
        const results: ProviderPagePricing[] = [];

        // xAI pricing patterns for Grok models
        const modelPatterns = [
          { name: 'grok-2-1212', aliases: ['grok-2-1212', 'Grok 2'] },
          { name: 'grok-2-vision-1212', aliases: ['grok-2-vision-1212', 'Grok 2 Vision'] },
          { name: 'grok-beta', aliases: ['grok-beta', 'Grok Beta'] },
        ];

        for (const { name, aliases } of modelPatterns) {
          for (const alias of aliases) {
            const regex = new RegExp(`${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,500}`, 'i');
            const modelSection = html.match(regex);

            if (modelSection) {
              const section = modelSection[0];
              // xAI pricing format: $X.XX per million tokens or /1M
              const prices = section.match(/\$?([\d.]+)\s*(?:\/|per)\s*(?:1M|million)/gi);

              if (prices && prices.length >= 2 && prices[0] && prices[1]) {
                const inputPrice = parseFloat(prices[0].replace(/[^0-9.]/g, ''));
                const outputPrice = parseFloat(prices[1].replace(/[^0-9.]/g, ''));

                if (!Number.isNaN(inputPrice) && !Number.isNaN(outputPrice)) {
                  results.push({
                    provider: 'xai',
                    model: name,
                    inputCostPerToken: inputPrice / 1000000,
                    outputCostPerToken: outputPrice / 1000000,
                    source: 'provider_page',
                    url: 'https://docs.x.ai/docs/models#models-and-pricing',
                  });
                  break;
                }
              }
            }
          }
        }

        return results;
      } catch (err) {
        logger.warn(`xAI pricing extraction failed: ${err instanceof Error ? err.message : 'unknown'}`);
        return [];
      }
    },
  },
};

export function getProviderPricingUrl(provider: string): string | undefined {
  return PROVIDER_PAGES[provider]?.url;
}

export function getAllProviderPricingUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [provider, config] of Object.entries(PROVIDER_PAGES)) {
    urls[provider] = config.url;
  }
  return urls;
}

export async function fetchProviderPagePricing(provider: string): Promise<ProviderPagePricing[]> {
  const config = PROVIDER_PAGES[provider];
  if (!config) return [];

  try {
    const response = await axios.get(config.url, {
      timeout: 15000,
      headers: { 'User-Agent': 'AIGNE-Hub-Pricing-Checker/1.0' },
    });
    return config.extractPricing(response.data);
  } catch (error) {
    logger.warn(`Failed to fetch pricing page for ${provider}`, { error, url: config.url });
    return [];
  }
}

export async function fetchAllProviderPages(): Promise<Record<string, ProviderPagePricing[]>> {
  const results: Record<string, ProviderPagePricing[]> = {};

  await Promise.allSettled(
    Object.keys(PROVIDER_PAGES).map(async (provider) => {
      results[provider] = await fetchProviderPagePricing(provider);
    })
  );

  return results;
}
