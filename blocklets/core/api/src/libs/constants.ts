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
