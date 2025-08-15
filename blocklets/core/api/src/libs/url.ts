import { Config } from './env';
import logger from './logger';

interface ShortUrlResponse {
  shortUrl: string;
  longUrl: string;
  shortCode: string;
  dateCreated: string;
}

interface ShortUrlRequest {
  longUrl: string;
  tags?: string[];
  shortCodeLength?: number;
  domain?: string;
  findIfExists?: boolean;
  validateUrl?: boolean;
  forwardQuery?: boolean;
  crawlable?: boolean;
}

export async function formatToShortUrl(url: string): Promise<string> {
  const apiKey = Config.shortUrlApiKey;

  if (!apiKey) {
    return url;
  }

  try {
    const requestPayload: ShortUrlRequest = {
      longUrl: url,
      tags: [],
      shortCodeLength: 4,
      domain: 's.abtnet.io',
      findIfExists: true,
      validateUrl: true,
      forwardQuery: true,
      crawlable: true,
    };

    const response = await fetch('https://s.abtnet.io/rest/v3/short-urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      logger.warn('Failed to create short URL, using original URL', {
        status: response.status,
        statusText: response.statusText,
        url,
      });
      return url;
    }

    const data: ShortUrlResponse = await response.json();
    return data.shortUrl;
  } catch (error) {
    logger.error('Error creating short URL, using original URL', { error, url });
    return url;
  }
}
