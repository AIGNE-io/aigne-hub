import type { Context } from 'hono';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';

import {
  buildProviderHeaders,
  buildUpstreamUrl,
  calculateCredits,
  estimateMaxCredits,
  fromAnthropicResponse,
  fromGeminiResponse,
  recordModelCall,
  recordUsage,
  resolveProvider,
  toAnthropicRequestBody,
  toGeminiRequestBody,
} from '../libs/ai-proxy';
import { deductCredits, preDeductCredits, refundHold, settleCredits } from '../libs/credit';
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

function getWaitUntil(c: Context<HonoEnv>): ((p: Promise<unknown>) => void) | null {
  const ctx = c.get('executionCtx');
  return ctx ? (p: Promise<unknown>) => ctx.waitUntil(p) : null;
}

async function handleChatCompletion(c: Context<HonoEnv>) {
  const db = c.get('db');
  const waitUntil = getWaitUntil(c);
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
    delete (body as { prompt?: string }).prompt; // Remove legacy field before forwarding
  }

  if (!body.messages?.length) {
    return c.json({ error: { message: 'messages is required' } }, 400);
  }

  // Resolve provider
  const provider = await resolveProvider(db, body.model, c.env.CREDENTIAL_ENCRYPTION_KEY);
  if (!provider) {
    return c.json({ error: { message: `No available provider for model: ${body.model}` } }, 404);
  }

  // Pre-deduct estimated credits
  let holdAmount = 0;
  if (userDid) {
    // Rough estimate: ~4 chars per token for input, use max_tokens for output
    const estimatedInputTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const maxOutputTokens = body.max_tokens || 4096;
    const estimatedCredits = await estimateMaxCredits(db, provider.providerId, provider.modelName, {
      estimatedInputTokens,
      maxOutputTokens,
    });

    if (estimatedCredits > 0) {
      const hold = await preDeductCredits(db, userDid, estimatedCredits, { model: provider.modelName });
      if (!hold.success) {
        return c.json({ error: { message: 'Insufficient credits', balance: hold.balance } }, 402);
      }
      holdAmount = hold.holdAmount;
    }
  }

  const isGoogle = provider.providerName === 'google';
  const isAnthropic = provider.providerName === 'anthropic';
  const upstreamUrl = buildUpstreamUrl(provider, 'chat', { stream: body.stream });
  const headers = buildProviderHeaders(provider);

  // Build upstream request body (provider-specific formats)
  let upstreamBody: Record<string, unknown>;
  if (isGoogle) {
    upstreamBody = toGeminiRequestBody(body.messages, {
      maxTokens: body.max_tokens,
      temperature: body.temperature,
      topP: body.top_p,
    });
  } else if (isAnthropic) {
    upstreamBody = toAnthropicRequestBody(body.messages, {
      model: provider.modelName,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
      topP: body.top_p,
      stream: body.stream,
    });
  } else {
    // OpenAI newer models (o-series, gpt-5) require max_completion_tokens instead of max_tokens
    const { max_tokens, ...rest } = body;
    upstreamBody = { ...rest, model: provider.modelName };
    if (max_tokens) {
      upstreamBody.max_completion_tokens = max_tokens;
    }
  }

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

      // Record failed call via waitUntil
      const failPromise = recordModelCall(db, {
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
      }, c.env.AUTH_KV);
      if (waitUntil) waitUntil(failPromise);

      // Refund pre-deducted credits on upstream error
      if (userDid && holdAmount > 0) {
        const refundPromise = refundHold(db, userDid, holdAmount);
        if (waitUntil) waitUntil(refundPromise);
        else await refundPromise;
      }

      // Return upstream error detail for debugging
      let errorDetail = `Provider error: ${upstreamResponse.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        errorDetail = parsed.error?.message || parsed.message || errorDetail;
      } catch {
        errorDetail = errorBody.substring(0, 500) || errorDetail;
      }
      return c.json(
        { error: { message: errorDetail, status: upstreamResponse.status, upstream: upstreamUrl } },
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
        let currentEvent = '';

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            sseBuffer += chunk;

            // Guard against unbounded buffer growth (e.g. upstream sends no newlines)
            if (sseBuffer.length > 1_000_000) {
              sseBuffer = sseBuffer.slice(-10_000);
            }

            // Process complete SSE lines from buffer
            const parts = sseBuffer.split('\n');
            // Keep the last incomplete line in the buffer
            sseBuffer = parts.pop() || '';

            for (const line of parts) {
              // Track SSE event type (Anthropic uses event: lines before data: lines)
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
                // Anthropic: message_stop signals end of stream
                if (isAnthropic && currentEvent === 'message_stop') break;
                continue;
              }

              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (isGoogle) {
                    // Google Gemini SSE: candidates[].content.parts[].text
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      // eslint-disable-next-line no-await-in-loop
                      await writable.write(text);
                    }
                    if (data.usageMetadata) {
                      usageData = {
                        prompt_tokens: data.usageMetadata.promptTokenCount || 0,
                        completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
                        total_tokens: data.usageMetadata.totalTokenCount || 0,
                      };
                    }
                  } else if (isAnthropic) {
                    // Anthropic SSE: event-typed data lines
                    if (currentEvent === 'content_block_delta' && data.delta?.text) {
                      // eslint-disable-next-line no-await-in-loop
                      await writable.write(data.delta.text);
                    }
                    if (currentEvent === 'message_start' && data.message?.usage) {
                      usageData = {
                        prompt_tokens: data.message.usage.input_tokens || 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                      };
                    }
                    if (currentEvent === 'message_delta' && data.usage) {
                      usageData = {
                        ...usageData,
                        completion_tokens: data.usage.output_tokens || 0,
                        total_tokens: (usageData?.prompt_tokens || 0) + (data.usage.output_tokens || 0),
                      };
                    }
                  } else {
                    // OpenAI SSE: choices[].delta.content
                    if (data.usage) {
                      usageData = data.usage;
                    }
                    const content = data.choices?.[0]?.delta?.content;
                    if (content) {
                      // eslint-disable-next-line no-await-in-loop
                      await writable.write(content);
                    }
                  }
                  currentEvent = '';
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

        // Record call + usage via waitUntil (survives after response)
        const recordPromise = Promise.all([
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
          }, c.env.AUTH_KV),
          recordUsage(db, {
            promptTokens,
            completionTokens,
            type: 'chatCompletion',
            model: provider.modelName,
            userDid,
            appId: appDid,
            usedCredits: credits.toFixed(10),
          }, c.env.AUTH_KV),
        ]);
        if (waitUntil) waitUntil(recordPromise);

        // Settle pre-deducted credits (refund difference)
        if (userDid && holdAmount > 0) {
          const settlePromise = settleCredits(db, userDid, holdAmount, credits, {
            model: provider.modelName,
          });
          if (waitUntil) waitUntil(settlePromise);
          else await settlePromise;
        }
      });
    }

    // Non-streaming response
    providerTtfb = Date.now() - providerStartTime;
    const rawResponse = await upstreamResponse.json<Record<string, unknown>>();
    // Convert provider-specific response to OpenAI format
    const responseData = isGoogle
      ? fromGeminiResponse(rawResponse, provider.modelName)
      : isAnthropic
        ? fromAnthropicResponse(rawResponse, provider.modelName)
        : (rawResponse as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
            [key: string]: unknown;
          });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const promptTokens = responseData.usage?.prompt_tokens || 0;
    const completionTokens = responseData.usage?.completion_tokens || 0;
    const totalUsage = promptTokens + completionTokens;

    const { credits } = await calculateCredits(db, provider.providerId, provider.modelName, {
      promptTokens,
      completionTokens,
    });

    // Record call + usage via waitUntil
    const recordPromise = Promise.all([
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
      }, c.env.AUTH_KV),
      recordUsage(db, {
        promptTokens,
        completionTokens,
        type: 'chatCompletion',
        model: provider.modelName,
        userDid,
        appId: appDid,
        usedCredits: credits.toFixed(10),
      }, c.env.AUTH_KV),
    ]);
    if (waitUntil) waitUntil(recordPromise);

    // Settle pre-deducted credits (refund difference)
    if (userDid && holdAmount > 0) {
      const settlePromise = settleCredits(db, userDid, holdAmount, credits, {
        model: provider.modelName,
      });
      if (waitUntil) waitUntil(settlePromise);
      else await settlePromise;
    }

    return c.json({
      ...responseData,
      modelWithProvider: `${provider.providerName}/${provider.modelName}`,
    });
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const message = err instanceof Error ? err.message : 'Internal proxy error';

    const errPromise = recordModelCall(db, {
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
    }, c.env.AUTH_KV);
    if (waitUntil) waitUntil(errPromise);

    // Refund pre-deducted credits on error
    if (userDid && holdAmount > 0) {
      const refundPromise = refundHold(db, userDid, holdAmount);
      if (waitUntil) waitUntil(refundPromise);
      else await refundPromise;
    }

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

  const provider = await resolveProvider(db, body.model, c.env.CREDENTIAL_ENCRYPTION_KEY);
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

  const ctx = c.get('executionCtx');
  const p = recordModelCall(db, {
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
  }, c.env.AUTH_KV);
  if (ctx) ctx.waitUntil(p);

  if (userDid && credits > 0) {
    await deductCredits(db, userDid, credits, { model: provider.modelName });
  }

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

  const provider = await resolveProvider(db, body.model, c.env.CREDENTIAL_ENCRYPTION_KEY);
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

  const ctx = c.get('executionCtx');
  const p = recordModelCall(db, {
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
  }, c.env.AUTH_KV);
  if (ctx) ctx.waitUntil(p);

  if (userDid && credits > 0) {
    await deductCredits(db, userDid, credits, { model: provider.modelName });
  }

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

  const provider = await resolveProvider(db, body.model, c.env.CREDENTIAL_ENCRYPTION_KEY);
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

  const ctx = c.get('executionCtx');
  const p = recordModelCall(db, {
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
  }, c.env.AUTH_KV);
  if (ctx) ctx.waitUntil(p);

  return c.json(data);
});

// ============================================================
// Gemini Native API — transparent proxy (no format conversion)
// POST /api/v2/models/:model::method (e.g. :generateContent, :streamGenerateContent)
// ============================================================
routes.post('/models/:modelAndMethod', async (c) => {
  const db = c.get('db');
  const waitUntil = getWaitUntil(c);
  const startTime = Date.now();
  const userDid = (c.get('user') as { id?: string } | undefined)?.id || '';

  // Parse "gemini-3-flash-preview:generateContent" or "gemini-3-flash-preview:streamGenerateContent"
  const param = c.req.param('modelAndMethod');
  const colonIdx = param.lastIndexOf(':');
  if (colonIdx === -1) {
    return c.json({ error: { message: 'Invalid format. Use /models/{model}:{method}' } }, 400);
  }
  const modelName = param.substring(0, colonIdx);
  const method = param.substring(colonIdx + 1);
  const isStream = method === 'streamGenerateContent';

  // Resolve provider (must be google)
  const provider = await resolveProvider(db, modelName, c.env.CREDENTIAL_ENCRYPTION_KEY);
  if (!provider) {
    return c.json({ error: { message: `No available provider for model: ${modelName}` } }, 404);
  }

  if (provider.providerName !== 'google') {
    return c.json({ error: { message: 'Gemini API only supports Google models' } }, 400);
  }

  // Build Google API URL
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const queryParams = isStream
    ? `alt=sse&key=${provider.apiKey}`
    : `key=${provider.apiKey}`;
  const upstreamUrl = `${baseUrl}/models/${provider.modelName}:${method}?${queryParams}`;

  // Forward request body as-is (Gemini native format)
  const body = await c.req.text();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return new Response(errorText, {
        status: upstreamResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Record call
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const recordP = recordModelCall(db, {
      providerId: provider.providerId,
      model: provider.modelName,
      credentialId: provider.credentialId,
      type: 'chatCompletion',
      status: 'success',
      totalUsage: 0,
      credits: '0',
      duration,
      userDid,
      callTime: Math.floor(startTime / 1000),
    }, c.env.AUTH_KV);
    if (waitUntil) waitUntil(recordP);

    // Streaming: pipe through directly
    if (isStream && upstreamResponse.body) {
      return new Response(upstreamResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming: return as-is
    const responseBody = await upstreamResponse.text();
    return new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy error';
    return c.json({ error: { message } }, 502);
  }
});

export default routes;
