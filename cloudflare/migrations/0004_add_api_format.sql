-- Add apiFormat column to AiProviders
ALTER TABLE AiProviders ADD COLUMN apiFormat TEXT DEFAULT 'openai';

-- Set existing providers to their correct format
UPDATE AiProviders SET apiFormat = 'anthropic' WHERE name = 'anthropic';
UPDATE AiProviders SET apiFormat = 'gemini' WHERE name = 'google';
