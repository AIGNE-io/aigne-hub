export const providers = {
  openai: 'openai',
  anthropic: 'anthropic',
  bedrock: 'bedrock',
  deepseek: 'deepseek',
  google: 'google',
  ollama: 'ollama',
  openrouter: 'openrouter',
  xai: 'xai',
  doubao: 'doubao',
  poe: 'poe',
} as const;

export type AIProvider = keyof typeof providers;
