export const AI_KIT_BASE_URL = process.env.AI_KIT_BASE_URL || 'https://www.aikit.rocks/ai-kit';

// Note: sync from blocklet/aigne-hub/src/api/constants.ts

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
} as const;

export const AI_PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  [AI_PROVIDERS.OPENAI]: 'OpenAI',
  [AI_PROVIDERS.ANTHROPIC]: 'Anthropic',
  [AI_PROVIDERS.BEDROCK]: 'Amazon Bedrock',
  [AI_PROVIDERS.DEEPSEEK]: 'DeepSeek',
  [AI_PROVIDERS.GOOGLE]: 'Google AI',
  [AI_PROVIDERS.OLLAMA]: 'Ollama',
  [AI_PROVIDERS.OPENROUTER]: 'OpenRouter',
  [AI_PROVIDERS.XAI]: 'xAI',
  [AI_PROVIDERS.DOUBAO]: 'Doubao',
  [AI_PROVIDERS.POE]: 'Poe',
};

export type AIProviderType = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

export const AI_PROVIDER_VALUES = Object.values(AI_PROVIDERS);

export const AI_PROVIDER_SET = new Set(AI_PROVIDER_VALUES);

export const isValidAIProvider = (provider: string): provider is AIProviderType => {
  return AI_PROVIDER_SET.has(provider as AIProviderType);
};
