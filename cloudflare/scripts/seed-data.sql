-- Seed data for local development
-- Run: pnpm db:seed

-- Providers
INSERT OR REPLACE INTO AiProviders (id, name, displayName, baseUrl, enabled, createdAt, updatedAt) VALUES
  ('p-openai', 'openai', 'OpenAI', 'https://api.openai.com/v1', 1, datetime('now'), datetime('now')),
  ('p-anthropic', 'anthropic', 'Anthropic', 'https://api.anthropic.com/v1', 1, datetime('now'), datetime('now')),
  ('p-google', 'google', 'Google', 'https://generativelanguage.googleapis.com/v1beta', 1, datetime('now'), datetime('now')),
  ('p-deepseek', 'deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 1, datetime('now'), datetime('now')),
  ('p-xai', 'xai', 'xAI', 'https://api.x.ai/v1', 1, datetime('now'), datetime('now'));

-- Model Rates - OpenAI
INSERT OR REPLACE INTO AiModelRates (id, providerId, model, modelDisplay, type, inputRate, outputRate, unitCosts, deprecated, createdAt, updatedAt) VALUES
  ('r-gpt4o', 'p-openai', 'gpt-4o', 'GPT-4o', 'chatCompletion', '0.0000025', '0.00001', '{"input":2.5,"output":10}', 0, datetime('now'), datetime('now')),
  ('r-gpt4o-mini', 'p-openai', 'gpt-4o-mini', 'GPT-4o Mini', 'chatCompletion', '0.00000015', '0.0000006', '{"input":0.15,"output":0.6}', 0, datetime('now'), datetime('now')),
  ('r-gpt41', 'p-openai', 'gpt-4.1', 'GPT-4.1', 'chatCompletion', '0.000002', '0.000008', '{"input":2,"output":8}', 0, datetime('now'), datetime('now')),
  ('r-gpt41-mini', 'p-openai', 'gpt-4.1-mini', 'GPT-4.1 Mini', 'chatCompletion', '0.0000004', '0.0000016', '{"input":0.4,"output":1.6}', 0, datetime('now'), datetime('now')),
  ('r-gpt41-nano', 'p-openai', 'gpt-4.1-nano', 'GPT-4.1 Nano', 'chatCompletion', '0.0000001', '0.0000004', '{"input":0.1,"output":0.4}', 0, datetime('now'), datetime('now')),
  ('r-o3', 'p-openai', 'o3', 'o3', 'chatCompletion', '0.00001', '0.00004', '{"input":10,"output":40}', 0, datetime('now'), datetime('now')),
  ('r-o4-mini', 'p-openai', 'o4-mini', 'o4-mini', 'chatCompletion', '0.0000011', '0.0000044', '{"input":1.1,"output":4.4}', 0, datetime('now'), datetime('now')),
  ('r-dall-e-3', 'p-openai', 'dall-e-3', 'DALL-E 3', 'imageGeneration', '0', '0.04', '{"input":0,"output":40}', 0, datetime('now'), datetime('now')),
  ('r-text-embed-3s', 'p-openai', 'text-embedding-3-small', 'Embedding 3 Small', 'embedding', '0.00000002', '0', '{"input":0.02,"output":0}', 0, datetime('now'), datetime('now'));

-- Model Rates - Anthropic
INSERT OR REPLACE INTO AiModelRates (id, providerId, model, modelDisplay, type, inputRate, outputRate, unitCosts, deprecated, createdAt, updatedAt) VALUES
  ('r-opus', 'p-anthropic', 'claude-opus-4', 'Claude Opus 4', 'chatCompletion', '0.000015', '0.000075', '{"input":15,"output":75}', 0, datetime('now'), datetime('now')),
  ('r-sonnet', 'p-anthropic', 'claude-sonnet-4', 'Claude Sonnet 4', 'chatCompletion', '0.000003', '0.000015', '{"input":3,"output":15}', 0, datetime('now'), datetime('now')),
  ('r-haiku', 'p-anthropic', 'claude-haiku-4', 'Claude Haiku 4', 'chatCompletion', '0.0000008', '0.000004', '{"input":0.8,"output":4}', 0, datetime('now'), datetime('now'));

-- Model Rates - Google
INSERT OR REPLACE INTO AiModelRates (id, providerId, model, modelDisplay, type, inputRate, outputRate, unitCosts, deprecated, createdAt, updatedAt) VALUES
  ('r-gemini-2-flash', 'p-google', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'chatCompletion', '0.00000015', '0.0000006', '{"input":0.15,"output":0.6}', 0, datetime('now'), datetime('now')),
  ('r-gemini-2-pro', 'p-google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'chatCompletion', '0.00000125', '0.000005', '{"input":1.25,"output":5}', 0, datetime('now'), datetime('now'));

-- Model Rates - DeepSeek
INSERT OR REPLACE INTO AiModelRates (id, providerId, model, modelDisplay, type, inputRate, outputRate, unitCosts, deprecated, createdAt, updatedAt) VALUES
  ('r-ds-chat', 'p-deepseek', 'deepseek-chat', 'DeepSeek V3', 'chatCompletion', '0.00000027', '0.0000011', '{"input":0.27,"output":1.1}', 0, datetime('now'), datetime('now')),
  ('r-ds-reasoner', 'p-deepseek', 'deepseek-reasoner', 'DeepSeek R1', 'chatCompletion', '0.00000055', '0.00000219', '{"input":0.55,"output":2.19}', 0, datetime('now'), datetime('now'));

-- Model Rates - xAI
INSERT OR REPLACE INTO AiModelRates (id, providerId, model, modelDisplay, type, inputRate, outputRate, unitCosts, deprecated, createdAt, updatedAt) VALUES
  ('r-grok3', 'p-xai', 'grok-3', 'Grok 3', 'chatCompletion', '0.000003', '0.000015', '{"input":3,"output":15}', 0, datetime('now'), datetime('now')),
  ('r-grok3-mini', 'p-xai', 'grok-3-mini', 'Grok 3 Mini', 'chatCompletion', '0.0000003', '0.0000005', '{"input":0.3,"output":0.5}', 0, datetime('now'), datetime('now'));

-- Model Statuses (all available)
INSERT OR REPLACE INTO AiModelStatuses (id, providerId, model, type, available, lastChecked, createdAt, updatedAt) VALUES
  ('s-gpt4o', 'p-openai', 'gpt-4o', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now')),
  ('s-gpt4o-mini', 'p-openai', 'gpt-4o-mini', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now')),
  ('s-opus', 'p-anthropic', 'claude-opus-4', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now')),
  ('s-sonnet', 'p-anthropic', 'claude-sonnet-4', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now')),
  ('s-haiku', 'p-anthropic', 'claude-haiku-4', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now')),
  ('s-gemini-flash', 'p-google', 'gemini-2.5-flash', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now')),
  ('s-ds-chat', 'p-deepseek', 'deepseek-chat', 'chatCompletion', 1, datetime('now'), datetime('now'), datetime('now'));
