import { describe, expect, it } from 'vitest';

import type { ResolvedProvider } from '../ai-proxy';
import { buildProviderHeaders, buildUpstreamUrl } from '../ai-proxy';

const openaiProvider: ResolvedProvider = {
  providerId: 'p1',
  providerName: 'openai',
  modelName: 'gpt-4o',
  credentialId: 'c1',
  apiKey: 'sk-xxx',
  baseUrl: 'https://api.openai.com/v1',
  apiFormat: 'openai',
};

const anthropicProvider: ResolvedProvider = {
  providerId: 'p2',
  providerName: 'anthropic',
  modelName: 'claude-sonnet-4-20250514',
  credentialId: 'c2',
  apiKey: 'sk-ant-xxx',
  baseUrl: 'https://api.anthropic.com/v1',
  apiFormat: 'anthropic',
};

const geminiProvider: ResolvedProvider = {
  providerId: 'p3',
  providerName: 'google',
  modelName: 'gemini-2.5-flash',
  credentialId: 'c3',
  apiKey: 'AIza-xxx',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiFormat: 'gemini',
};

const doubaoProvider: ResolvedProvider = {
  providerId: 'p4',
  providerName: 'doubao',
  modelName: 'doubao-pro',
  credentialId: 'c4',
  apiKey: 'sk-dou',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiFormat: 'openai',
};

const gw = { accountId: 'acc', gatewayId: 'gw' };

describe('buildUpstreamUrl with gateway', () => {
  it('routes OpenAI through gateway', () => {
    const url = buildUpstreamUrl(openaiProvider, 'chat', { gateway: gw });
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/acc/gw/openai/chat/completions');
  });

  it('routes Anthropic through gateway', () => {
    const url = buildUpstreamUrl(anthropicProvider, 'chat', { gateway: gw });
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/acc/gw/anthropic/v1/messages');
  });

  it('routes Gemini streaming through gateway', () => {
    const url = buildUpstreamUrl(geminiProvider, 'chat', { stream: true, gateway: gw });
    expect(url).toContain('google-ai-studio/v1/models/gemini-2.5-flash:streamGenerateContent');
  });

  it('routes Gemini non-streaming through gateway', () => {
    const url = buildUpstreamUrl(geminiProvider, 'chat', { gateway: gw });
    expect(url).toContain('google-ai-studio/v1/models/gemini-2.5-flash:generateContent');
  });

  it('routes Gemini embedding through gateway', () => {
    const url = buildUpstreamUrl(geminiProvider, 'embedding', { gateway: gw });
    expect(url).toContain('google-ai-studio/v1/models/gemini-2.5-flash:embedContent');
  });

  it('falls back to direct for unsupported provider (doubao)', () => {
    const url = buildUpstreamUrl(doubaoProvider, 'chat', { gateway: gw });
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
  });

  it('falls back to direct when no gateway config', () => {
    const url = buildUpstreamUrl(openaiProvider, 'chat', {});
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('falls back to direct when gateway is undefined', () => {
    const url = buildUpstreamUrl(openaiProvider, 'chat');
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('buildUpstreamUrl direct (existing behavior)', () => {
  it('builds OpenAI chat URL', () => {
    expect(buildUpstreamUrl(openaiProvider, 'chat')).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('builds OpenAI embedding URL', () => {
    expect(buildUpstreamUrl(openaiProvider, 'embedding')).toBe('https://api.openai.com/v1/embeddings');
  });

  it('builds Anthropic messages URL', () => {
    expect(buildUpstreamUrl(anthropicProvider, 'chat')).toBe('https://api.anthropic.com/v1/messages');
  });

  it('builds Gemini URL with key in query', () => {
    const url = buildUpstreamUrl(geminiProvider, 'chat');
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=AIza-xxx');
  });
});

describe('buildProviderHeaders', () => {
  it('sets Bearer auth for OpenAI', () => {
    const h = buildProviderHeaders(openaiProvider);
    expect(h.Authorization).toBe('Bearer sk-xxx');
    expect(h['Content-Type']).toBe('application/json');
  });

  it('sets x-api-key for Anthropic', () => {
    const h = buildProviderHeaders(anthropicProvider);
    expect(h['x-api-key']).toBe('sk-ant-xxx');
    expect(h['anthropic-version']).toBe('2023-06-01');
  });

  it('sets no auth header for Gemini direct (key in URL)', () => {
    const h = buildProviderHeaders(geminiProvider);
    expect(h['x-goog-api-key']).toBeUndefined();
    expect(h.Authorization).toBeUndefined();
  });

  it('sets x-goog-api-key for Gemini via gateway', () => {
    const h = buildProviderHeaders(geminiProvider, { viaGateway: true });
    expect(h['x-goog-api-key']).toBe('AIza-xxx');
  });

  it('ignores viaGateway for non-Gemini providers', () => {
    const h = buildProviderHeaders(openaiProvider, { viaGateway: true });
    expect(h.Authorization).toBe('Bearer sk-xxx');
    expect(h['x-goog-api-key']).toBeUndefined();
  });
});
