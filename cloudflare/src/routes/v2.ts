import type { Context } from 'hono';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';

import {
  buildProviderHeaders,
  buildUpstreamUrl,
  calculateCredits,
  recordModelCall,
  recordUsage,
  resolveProvider,
} from '../libs/ai-proxy';
import type { HonoEnv } from '../worker';

const routes = new Hono<HonoEnv>();

// GET /api/v2/status - Health check with credit info
routes.get('/status', async (c) => {
  return c.json({ status: 'ok', creditBasedBilling: true });
});

// POST /api/v2/chat/completions - OpenAI-compatible chat completion
// POST /api/v2/completions - same endpoint
routes.post('/chat/completions', (c) => handleChatCompletion(c));
routes.post('/completions', (c) => handleChatCompletion(c));

async function handleChatCompletion(c: Context<HonoEnv>) {
  const db = c.get('db');
  const startTime = Date.now();
  const userDid = (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';
  const appDid = c.req.header('x-aigne-hub-client-did') || '';
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();

  // Parse request body
  const body = await c.req.json<{
    model: string;
    prompt?: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    [key: string]: unknown;
  }>();

  if (!body.model) {
    return c.json({ error: { message: 'model is required' } }, 400);
  }

  // Support `prompt` field (legacy) — convert to `messages` format
  if (!body.messages?.length && (body as { prompt?: string }).prompt) {
    body.messages = [{ role: 'user', content: (body as { prompt?: string }).prompt! }];
  }

  if (!body.messages?.length) {
    return c.json({ error: { message: 'messages is required' } }, 400);
  }

  // Resolve provider
  const provider = await resolveProvider(db, body.model);
  if (!provider) {
    return c.json({ error: { message: `No available provider for model: ${body.model}` } }, 404);
  }

  const upstreamUrl = buildUpstreamUrl(provider, 'chat');
  const headers = buildProviderHeaders(provider);

  // Build upstream request body
  const upstreamBody = {
    ...body,
    model: provider.modelName,
  };

  let providerTtfb: number | undefined;
  const providerStartTime = Date.now();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
    });

    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Record failed call
      recordModelCall(db, {
        providerId: provider.providerId,
        model: provider.modelName,
        credentialId: provider.credentialId,
        type: 'chatCompletion',
        status: 'failed',
        totalUsage: 0,
        credits: '0',
        duration,
        errorReason: errorBody.substring(0, 1000),
        userDid,
        appDid,
        requestId,
        callTime: Math.floor(startTime / 1000),
      });

      return c.json(
        { error: { message: `Provider error: ${upstreamResponse.status}`, status: upstreamResponse.status } },
        upstreamResponse.status as 400
      );
    }

    // Streaming response
    if (body.stream && upstreamResponse.body) {
      providerTtfb = Date.now() - providerStartTime;

      return stream(c, async (writable) => {
        c.header('Content-Type', 'text/plain; charset=utf-8');
        c.header('Cache-Control', 'no-cache');
        c.header('X-Accel-Buffering', 'no');

        const reader = upstreamResponse.body!.getReader();
        const decoder = new TextDecoder();
        let usageData: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
        let sseBuffer = '';

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            sseBuffer += chunk;

            // Process complete SSE lines from buffer
            const parts = sseBuffer.split('\n');
            // Keep the last incomplete line in the buffer
            sseBuffer = parts.pop() || '';

            for (const line of parts) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.usage) {
                    usageData = data.usage;
                  }
                  // Extract text content from SSE and write as plain text
                  const content = data.choices?.[0]?.delta?.content;
                  if (content) {
                    // eslint-disable-next-line no-await-in-loop
                    await writable.write(content);
                  }
                } catch {
                  // ignore parse errors in stream
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Record usage after stream completes
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const promptTokens = usageData?.prompt_tokens || 0;
        const completionTokens = usageData?.completion_tokens || 0;
        const totalUsage = promptTokens + completionTokens;

        const { credits } = await calculateCredits(db, provider.providerId, provider.modelName, {
          promptTokens,
          completionTokens,
        });

        // Fire-and-forget: record call + usage
        recordModelCall(db, {
          providerId: provider.providerId,
          model: provider.modelName,
          credentialId: provider.credentialId,
          type: 'chatCompletion',
          status: 'success',
          totalUsage,
          usageMetrics: { promptTokens, completionTokens },
          credits: credits.toFixed(10),
          duration,
          userDid,
          appDid,
          requestId,
          callTime: Math.floor(startTime / 1000),
          ttfb: providerTtfb?.toFixed(1),
          providerTtfb: providerTtfb?.toFixed(1),
        });

        recordUsage(db, {
          promptTokens,
          completionTokens,
          type: 'chatCompletion',
          model: provider.modelName,
          userDid,
          appId: appDid,
          usedCredits: credits.toFixed(10),
        });
      });
    }

    // Non-streaming response
    providerTtfb = Date.now() - providerStartTime;
    const responseData = await upstreamResponse.json<{
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      [key: string]: unknown;
    }>();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const promptTokens = responseData.usage?.prompt_tokens || 0;
    const completionTokens = responseData.usage?.completion_tokens || 0;
    const totalUsage = promptTokens + completionTokens;

    const { credits } = await calculateCredits(db, provider.providerId, provider.modelName, {
      promptTokens,
      completionTokens,
    });

    // Fire-and-forget
    recordModelCall(db, {
      providerId: provider.providerId,
      model: provider.modelName,
      credentialId: provider.credentialId,
      type: 'chatCompletion',
      status: 'success',
      totalUsage,
      usageMetrics: { promptTokens, completionTokens },
      credits: credits.toFixed(10),
      duration,
      userDid,
      appDid,
      requestId,
      callTime: Math.floor(startTime / 1000),
      ttfb: providerTtfb?.toFixed(1),
      providerTtfb: providerTtfb?.toFixed(1),
    });

    recordUsage(db, {
      promptTokens,
      completionTokens,
      type: 'chatCompletion',
      model: provider.modelName,
      userDid,
      appId: appDid,
      usedCredits: credits.toFixed(10),
    });

    return c.json({
      ...responseData,
      modelWithProvider: `${provider.providerName}/${provider.modelName}`,
    });
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const message = err instanceof Error ? err.message : 'Internal proxy error';

    recordModelCall(db, {
      providerId: provider.providerId,
      model: provider.modelName,
      credentialId: provider.credentialId,
      type: 'chatCompletion',
      status: 'failed',
      totalUsage: 0,
      credits: '0',
      duration,
      errorReason: message.substring(0, 1000),
      userDid,
      appDid,
      requestId,
      callTime: Math.floor(startTime / 1000),
    });

    return c.json({ error: { message } }, 502);
  }
}

// POST /api/v2/embeddings
routes.post('/embeddings', async (c) => {
  const db = c.get('db');
  const startTime = Date.now();
  const userDid = (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';

  const body = await c.req.json<{ model: string; input: string | string[] }>();
  if (!body.model || !body.input) {
    return c.json({ error: { message: 'model and input are required' } }, 400);
  }

  const provider = await resolveProvider(db, body.model);
  if (!provider) {
    return c.json({ error: { message: `No available provider for model: ${body.model}` } }, 404);
  }

  const upstreamUrl = buildUpstreamUrl(provider, 'embedding');
  const headers = buildProviderHeaders(provider);

  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, model: provider.modelName }),
  });

  if (!response.ok) {
    return c.json({ error: { message: `Provider error: ${response.status}` } }, response.status as 400);
  }

  const data = await response.json<{
    usage?: { prompt_tokens?: number; total_tokens?: number };
    [key: string]: unknown;
  }>();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const promptTokens = data.usage?.prompt_tokens || 0;

  const { credits } = await calculateCredits(db, provider.providerId, provider.modelName, { promptTokens });

  recordModelCall(db, {
    providerId: provider.providerId,
    model: provider.modelName,
    credentialId: provider.credentialId,
    type: 'embedding',
    status: 'success',
    totalUsage: promptTokens,
    credits: credits.toFixed(10),
    duration,
    userDid,
    callTime: Math.floor(startTime / 1000),
  });

  return c.json(data);
});

// POST /api/v2/images/generations
routes.post('/images/generations', async (c) => {
  const db = c.get('db');
  const startTime = Date.now();
  const userDid = (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';

  const body = await c.req.json<{ model: string; prompt: string; n?: number; size?: string }>();
  if (!body.model || !body.prompt) {
    return c.json({ error: { message: 'model and prompt are required' } }, 400);
  }

  const provider = await resolveProvider(db, body.model);
  if (!provider) {
    return c.json({ error: { message: `No available provider for model: ${body.model}` } }, 404);
  }

  const upstreamUrl = buildUpstreamUrl(provider, 'image');
  const headers = buildProviderHeaders(provider);

  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, model: provider.modelName }),
  });

  if (!response.ok) {
    return c.json({ error: { message: `Provider error: ${response.status}` } }, response.status as 400);
  }

  const data = await response.json();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const numImages = body.n || 1;

  const { credits } = await calculateCredits(db, provider.providerId, provider.modelName, {
    numberOfImageGeneration: numImages,
  });

  recordModelCall(db, {
    providerId: provider.providerId,
    model: provider.modelName,
    credentialId: provider.credentialId,
    type: 'imageGeneration',
    status: 'success',
    totalUsage: numImages,
    usageMetrics: { numberOfImageGeneration: numImages, imageSize: body.size },
    credits: credits.toFixed(10),
    duration,
    userDid,
    callTime: Math.floor(startTime / 1000),
  });

  return c.json(data);
});

// POST /api/v2/video/generations
routes.post('/video/generations', async (c) => {
  const db = c.get('db');
  const startTime = Date.now();
  const userDid = (c.get('user') as { id?: string } | undefined)?.id || c.req.header('x-user-did') || '';

  const body = await c.req.json<{ model: string; prompt: string; [key: string]: unknown }>();
  if (!body.model || !body.prompt) {
    return c.json({ error: { message: 'model and prompt are required' } }, 400);
  }

  const provider = await resolveProvider(db, body.model);
  if (!provider) {
    return c.json({ error: { message: `No available provider for model: ${body.model}` } }, 404);
  }

  // Video: forward to provider as-is
  const headers = buildProviderHeaders(provider);
  const response = await fetch(`${provider.baseUrl}/video/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, model: provider.modelName }),
  });

  if (!response.ok) {
    return c.json({ error: { message: `Provider error: ${response.status}` } }, response.status as 400);
  }

  const data = await response.json();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  recordModelCall(db, {
    providerId: provider.providerId,
    model: provider.modelName,
    credentialId: provider.credentialId,
    type: 'video',
    status: 'success',
    totalUsage: 1,
    credits: '0',
    duration,
    userDid,
    callTime: Math.floor(startTime / 1000),
  });

  return c.json(data);
});

export default routes;
