/**
 * Model capabilities interface
 * Defines what features a model supports
 */
export interface ModelCapabilities {
  text: boolean; // All models support text
  vision: boolean; // Image understanding (GPT-4V, GPT-4o, Gemini Pro Vision, Claude 3, etc.)
  audio: boolean; // Audio input/output (Whisper, GPT-4o Audio, etc.)
  imageGeneration: boolean; // Image generation (DALL-E, Ideogram, etc.)
  realtime: boolean; // Realtime conversation support
  search: boolean; // Web search capability
  streaming: boolean; // Streaming response support
  maxImageCount?: number; // Maximum images per request
  supportedImageFormats?: string[]; // Supported image formats
}

/**
 * Attachment interface for file uploads
 */
export interface Attachment {
  type: 'image' | 'audio' | 'file';
  file?: File; // Optional: only present when uploading, not when loaded from cache
  url: string; // Object URL or base64 data URL for preview
  base64?: string; // Base64 encoded data for API transmission
  mimeType: string;
  size: number;
  name?: string;
}

/**
 * Image content part for vision API
 */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string; // base64 data URL or https URL
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Text content part for vision API
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/**
 * Content part union type
 */
export type ContentPart = TextContentPart | ImageContentPart;
