import { toFile } from 'openai';
import { Uploadable } from 'openai/uploads';

export async function processImageUrl(url: string, name?: string): Promise<Uploadable> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download image from ${url}`);
  }
  return toFile(response.body, name, { type: response.headers.get('content-type') || 'image/png' });
}
