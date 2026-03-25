import { describe, expect, it } from 'vitest';

import { buildGatewayUrl, getGatewayConfig, getGatewaySlug, shouldUseGateway, getSupportedGatewaySlugs } from '../ai-gateway';

describe('getGatewaySlug', () => {
  it('maps openai to openai', () => {
    expect(getGatewaySlug('openai')).toBe('openai');
  });

  it('maps google to google-ai-studio', () => {
    expect(getGatewaySlug('google')).toBe('google-ai-studio');
  });

  it('maps xai to grok', () => {
    expect(getGatewaySlug('xai')).toBe('grok');
  });

  it('maps deepseek to deepseek', () => {
    expect(getGatewaySlug('deepseek')).toBe('deepseek');
  });

  it('returns null for unsupported providers', () => {
    expect(getGatewaySlug('doubao')).toBeNull();
    expect(getGatewaySlug('bedrock')).toBeNull();
  });
});

describe('getGatewayConfig', () => {
  it('returns config when both env vars are set', () => {
    expect(getGatewayConfig({ AI_GATEWAY_ACCOUNT_ID: 'acc', AI_GATEWAY_ID: 'gw' })).toEqual({
      accountId: 'acc',
      gatewayId: 'gw',
    });
  });

  it('returns undefined when env vars are missing', () => {
    expect(getGatewayConfig({})).toBeUndefined();
    expect(getGatewayConfig({ AI_GATEWAY_ACCOUNT_ID: 'acc' })).toBeUndefined();
    expect(getGatewayConfig({ AI_GATEWAY_ID: 'gw' })).toBeUndefined();
  });
});

describe('buildGatewayUrl', () => {
  const gw = { accountId: 'acc123', gatewayId: 'gw456' };

  it('builds OpenAI chat URL', () => {
    expect(buildGatewayUrl(gw, 'openai', 'openai', 'chat', {})).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/openai/chat/completions'
    );
  });

  it('builds Anthropic messages URL', () => {
    expect(buildGatewayUrl(gw, 'anthropic', 'anthropic', 'chat', {})).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/anthropic/v1/messages'
    );
  });

  it('builds Gemini generateContent URL', () => {
    expect(buildGatewayUrl(gw, 'google', 'gemini', 'chat', { modelName: 'gemini-2.5-flash' })).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/google-ai-studio/v1/models/gemini-2.5-flash:generateContent'
    );
  });

  it('builds Gemini streaming URL', () => {
    expect(
      buildGatewayUrl(gw, 'google', 'gemini', 'chat', { modelName: 'gemini-2.5-flash', stream: true })
    ).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/google-ai-studio/v1/models/gemini-2.5-flash:streamGenerateContent?alt=sse'
    );
  });

  it('builds Gemini embedding URL', () => {
    expect(
      buildGatewayUrl(gw, 'google', 'gemini', 'embedding', { modelName: 'text-embedding-004' })
    ).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/google-ai-studio/v1/models/text-embedding-004:embedContent'
    );
  });

  it('builds DeepSeek chat URL via gateway slug', () => {
    expect(buildGatewayUrl(gw, 'deepseek', 'openai', 'chat', {})).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/deepseek/chat/completions'
    );
  });

  it('builds xAI chat URL via grok slug', () => {
    expect(buildGatewayUrl(gw, 'xai', 'openai', 'chat', {})).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/grok/chat/completions'
    );
  });

  it('builds embedding URL', () => {
    expect(buildGatewayUrl(gw, 'openai', 'openai', 'embedding', {})).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/openai/embeddings'
    );
  });

  it('builds image URL', () => {
    expect(buildGatewayUrl(gw, 'openai', 'openai', 'image', {})).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/gw456/openai/images/generations'
    );
  });

  it('returns null for unsupported provider', () => {
    expect(buildGatewayUrl(gw, 'doubao', 'openai', 'chat', {})).toBeNull();
  });
});

describe('shouldUseGateway', () => {
  it('returns true for supported provider', () => {
    expect(shouldUseGateway('openai')).toBe(true);
    expect(shouldUseGateway('anthropic')).toBe(true);
    expect(shouldUseGateway('google')).toBe(true);
  });

  it('returns false for unsupported provider', () => {
    expect(shouldUseGateway('doubao')).toBe(false);
    expect(shouldUseGateway('bedrock')).toBe(false);
  });

  it('returns false when provider config opts out', () => {
    expect(shouldUseGateway('openai', { useGateway: false })).toBe(false);
  });

  it('returns true when provider config opts in explicitly', () => {
    expect(shouldUseGateway('openai', { useGateway: true })).toBe(true);
  });

  it('handles string config (JSON)', () => {
    expect(shouldUseGateway('openai', '{"useGateway": false}')).toBe(false);
    expect(shouldUseGateway('openai', '{"someOtherField": true}')).toBe(true);
  });

  it('handles null/undefined config', () => {
    expect(shouldUseGateway('openai', null)).toBe(true);
    expect(shouldUseGateway('openai', undefined)).toBe(true);
  });
});

describe('getSupportedGatewaySlugs', () => {
  it('returns all supported slugs', () => {
    const slugs = getSupportedGatewaySlugs();
    expect(slugs.openai).toBe('openai');
    expect(slugs.google).toBe('google-ai-studio');
    expect(slugs.xai).toBe('grok');
    expect(slugs.doubao).toBeUndefined();
  });
});

describe('custom provider support', () => {
  it('getGatewaySlug prefers dbGatewaySlug over hardcoded mapping', () => {
    expect(getGatewaySlug('openai', 'custom-openai')).toBe('custom-openai');
  });

  it('getGatewaySlug falls back to hardcoded when dbGatewaySlug is null', () => {
    expect(getGatewaySlug('openai', null)).toBe('openai');
    expect(getGatewaySlug('openai', undefined)).toBe('openai');
  });

  it('getGatewaySlug returns dbGatewaySlug for unknown providers', () => {
    expect(getGatewaySlug('my-vps', 'custom-vps')).toBe('custom-vps');
    expect(getGatewaySlug('my-vps')).toBeNull();
  });

  it('shouldUseGateway returns true for custom provider with dbGatewaySlug', () => {
    expect(shouldUseGateway('my-vps', null, 'custom-vps')).toBe(true);
  });

  it('shouldUseGateway returns false for custom provider without dbGatewaySlug', () => {
    expect(shouldUseGateway('my-vps', null, null)).toBe(false);
  });

  it('buildGatewayUrl uses dbGatewaySlug for custom providers', () => {
    const gw = { accountId: 'acc', gatewayId: 'gw' };
    expect(buildGatewayUrl(gw, 'my-vps', 'openai', 'chat', { dbGatewaySlug: 'custom-vps' })).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc/gw/custom-vps/chat/completions'
    );
  });

  it('buildGatewayUrl uses dbGatewaySlug for embedding endpoint', () => {
    const gw = { accountId: 'acc', gatewayId: 'gw' };
    expect(buildGatewayUrl(gw, 'my-vps', 'openai', 'embedding', { dbGatewaySlug: 'custom-vps' })).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc/gw/custom-vps/embeddings'
    );
  });

  it('buildGatewayUrl uses dbGatewaySlug for image endpoint', () => {
    const gw = { accountId: 'acc', gatewayId: 'gw' };
    expect(buildGatewayUrl(gw, 'my-vps', 'openai', 'image', { dbGatewaySlug: 'custom-vps' })).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc/gw/custom-vps/images/generations'
    );
  });
});
