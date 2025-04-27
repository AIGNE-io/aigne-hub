export interface ImageGenerationInput {
  model?: string;
  prompt: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024' | '1536x1024' | '1024x1536' | 'auto';
  n?: number;
  responseFormat?: 'url' | 'b64_json';
  style?: 'vivid' | 'natural';
  quality?: 'standard' | 'hd' | 'high' | 'medium' | 'low' | 'auto';
  background?: 'transparent' | 'opaque' | 'auto';
  outputFormat?: 'jpeg' | 'png' | 'webp';
  moderation?: 'low' | 'auto';
  outputCompression?: number;
}

export interface ImageGenerationResponse {
  data: ({ url: string; b64Json?: undefined } | { url?: undefined; b64Json: string })[];
}
