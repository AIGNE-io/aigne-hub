/**
 * Unified response adapter for AI completion endpoints.
 *
 * Returns a superset format that is:
 * 1. OpenAI SDK compatible — `id`, `object`, `model`, `choices`, `usage` (snake_case)
 * 2. AIGNE frontend compatible — `role`, `text`, `content`, `modelWithProvider`, `usage` (camelCase + credits)
 *
 * OpenAI SDKs ignore unknown fields, so the AIGNE extensions don't break compatibility.
 * AIGNE frontend reads from the top-level `role`/`text`/`content` fields.
 */

export interface AigneUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  aigneHubCredits: number;
  creditPrefix: string;
}

export interface CompletionResponseParams {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  credits: number;
  creditPrefix: string;
  requestId?: string;
  finishReason?: string;
}

export function buildCompletionResponse(params: CompletionResponseParams) {
  const {
    content,
    model,
    promptTokens,
    completionTokens,
    credits,
    creditPrefix,
    requestId,
    finishReason = 'stop',
  } = params;

  const totalTokens = promptTokens + completionTokens;

  return {
    // --- OpenAI compatible fields ---
    id: requestId || `aigne-${Date.now()}`,
    object: 'chat.completion' as const,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant' as const, content },
        finish_reason: finishReason,
      },
    ],
    usage: {
      // OpenAI snake_case
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      // AIGNE camelCase extensions
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalTokens,
      aigneHubCredits: credits,
      creditPrefix,
    },

    // --- AIGNE compatible fields ---
    role: 'assistant' as const,
    text: content,
    content,
    modelWithProvider: model,
  };
}
