// NOTE: Need to keep in sync with @blocklet/aigne-hub/api/constants.ts

export const AI_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  BEDROCK: 'bedrock',
  DEEPSEEK: 'deepseek',
  GOOGLE: 'google',
  OLLAMA: 'ollama',
  OPENROUTER: 'openrouter',
  XAI: 'xai',
  DOUBAO: 'doubao',
  POE: 'poe',
  IDEOGRAM: 'ideogram',
} as const;

export type AIProviderType = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

export const AI_PROVIDER_VALUES = Object.values(AI_PROVIDERS);

export const SUPPORTED_PROVIDERS_SET = new Set(AI_PROVIDER_VALUES);

export const AIGNE_HUB_DEFAULT_WEIGHT = 100;

/**
 * Provider priority ranking for rotation
 * Lower number = higher priority
 * 1: Direct provider connection (e.g., OpenAI, Google, Anthropic)
 * 2: Official aggregator (e.g., AWS Bedrock)
 * 3: Third-party aggregator (e.g., OpenRouter, Poe)
 * 4: Local deployment (e.g., Ollama)
 */
export const PROVIDER_RANK: Record<AIProviderType, number> = {
  openai: 1,
  anthropic: 1,
  google: 1,
  deepseek: 1,
  xai: 1,
  doubao: 1,
  ideogram: 1,
  bedrock: 2,
  openrouter: 3,
  poe: 3,
  ollama: 4,
};
