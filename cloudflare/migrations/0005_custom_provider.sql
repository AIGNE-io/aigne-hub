-- Add custom provider support: providerType and gatewaySlug fields
ALTER TABLE AiProviders ADD COLUMN providerType TEXT NOT NULL DEFAULT 'builtin';
ALTER TABLE AiProviders ADD COLUMN gatewaySlug TEXT;
