import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { useCallback, useEffect, useState } from 'react';

import { Attachment } from '../../api/types';
import { MessageItem } from './conversation';

const nextId = () => nanoid(16);
const STORAGE_KEY = 'aigne-hub-conversation-history';
const MAX_CACHED_MESSAGES = 50; // Limit cached messages

// Convert File to base64 data URL
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Build messages with images for vision models
const buildVisionMessages = async (
  prompt: string,
  attachments: Attachment[]
): Promise<ChatCompletionMessageParam[]> => {
  const imageUrls = await Promise.all(
    attachments.map(async (attachment) => {
      // Use cached base64 if available, otherwise convert
      if (attachment.base64) {
        return attachment.base64;
      }
      // If url is already base64, use it directly
      if (attachment.url.startsWith('data:')) {
        return attachment.url;
      }
      // Otherwise convert File to base64
      if (attachment.file) {
        return fileToBase64(attachment.file);
      }
      return attachment.url;
    })
  );

  return [
    {
      role: 'user',
      content: [
        ...imageUrls.map((url) => ({
          type: 'image_url' as const,
          image_url: { url },
        })),
        ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
      ],
    },
  ];
};

// Load messages from localStorage
const loadMessages = (): MessageItem[] => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Validate and filter out invalid messages
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((msg) => msg.id && (msg.prompt || msg.response));
      }
    }
  } catch (error) {
    console.warn('Failed to load conversation history:', error);
  }
  return [{ id: nextId(), response: 'Hi, I am AIGNE Hub! How can I assist you today?', timestamp: Date.now() }];
};

// Save messages to localStorage
const saveMessages = (messages: MessageItem[]) => {
  try {
    // Only save completed messages (no loading state)
    const toSave = messages
      .filter((msg) => !msg.loading)
      .slice(-MAX_CACHED_MESSAGES) // Keep only last N messages
      .map((msg) => ({
        id: msg.id,
        prompt: msg.prompt,
        response: msg.response,
        timestamp: msg.timestamp,
        meta: msg.meta,
        attachments: msg.attachments?.map((att) => ({
          type: att.type,
          url: att.url, // base64 data URL
          base64: att.base64,
          mimeType: att.mimeType,
          size: att.size,
          name: att.name,
          // Don't save File object
        })),
        // Don't save error state
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.warn('Failed to save conversation history:', error);
  }
};

export default function useConversation({
  scrollToBottom,
  textCompletions,
  imageGenerations,
  enableCache = true,
}: {
  scrollToBottom?: (options?: { force?: boolean }) => void;
  textCompletions: (
    prompt: string | ChatCompletionMessageParam[],
    options: { meta?: any }
  ) => Promise<
    ReadableStream<string | Uint8Array | { type: 'text'; text: string } | { type: 'images'; images: { url: string }[] }>
  >;
  imageGenerations?: (
    prompt: { prompt: string; n: number; size: string },
    options: { meta?: any }
  ) => Promise<{ url: string }[]>;
  enableCache?: boolean;
}) {
  const [messages, setMessages] = useState<MessageItem[]>(() =>
    enableCache
      ? loadMessages()
      : [{ id: nextId(), response: 'Hi, I am AIGNE Hub! How can I assist you today?', timestamp: Date.now() }]
  );
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (isInitialLoad && messages.length > 0) {
      // Wait for DOM to render
      setTimeout(() => {
        scrollToBottom?.({ force: true });
        setIsInitialLoad(false);
      }, 100);
    }
  }, [isInitialLoad, messages.length, scrollToBottom]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (enableCache && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, enableCache]);

  const add = useCallback(
    async (prompt: string | ChatCompletionMessageParam[], attachments?: Attachment[], meta?: any) => {
      const id = nextId();
      const timestamp = Date.now();

      // Convert attachments to base64 for persistent storage
      let base64Attachments: Attachment[] | undefined;
      if (attachments && attachments.length > 0) {
        base64Attachments = await Promise.all(
          attachments.map(async (attachment) => {
            // Get base64: either from cache, existing url (if already base64), or convert from file
            let base64: string;
            if (attachment.base64) {
              base64 = attachment.base64;
            } else if (attachment.url.startsWith('data:')) {
              base64 = attachment.url;
            } else if (attachment.file) {
              base64 = await fileToBase64(attachment.file);
            } else {
              base64 = attachment.url; // Fallback
            }

            return {
              ...attachment,
              url: base64, // Use base64 as url for display
              base64,
            };
          })
        );
      }

      setMessages((v) => v.concat({ id, prompt, loading: true, meta, timestamp, attachments: base64Attachments }));
      scrollToBottom?.({ force: true });

      try {
        // Handle image generation command
        if (imageGenerations && typeof prompt === 'string') {
          const m = prompt.match(/^\/image(\s+(?<size>256|512|1024))?(\s+(?<n>[1-9]|10))?\s+(?<prompt>[\s\S]+)/);
          if (m?.groups) {
            const {
              size = '256',
              n = '1',
              prompt,
            } = m.groups as any as { size: '256' | '512' | '1024'; n: string; prompt: string };
            const response = await imageGenerations(
              {
                prompt,
                n: parseInt(n, 10),
                size: `${size}x${size}`,
              },
              { meta }
            );

            setMessages((v) =>
              produce(v, (draft) => {
                const item = draft.find((i) => i.id === id);
                if (item) item.response = response;
              })
            );
            return { id, data: response };
          }
        }

        // Build prompt with attachments if any
        let finalPrompt: string | ChatCompletionMessageParam[] = prompt;

        if (base64Attachments && base64Attachments.length > 0 && typeof prompt === 'string') {
          // Convert to vision message format (base64Attachments already have base64)
          finalPrompt = await buildVisionMessages(prompt, base64Attachments);
        }

        const result = await textCompletions(finalPrompt, { meta });

        const isText = (i: any): i is { type: 'text'; text: string } => i.type === 'text';
        const isImages = (i: any): i is { type: 'images'; images: { url: string }[] } => i.type === 'images';

        const reader = result.getReader();
        const decoder = new TextDecoder();

        let response: MessageItem['response'] = '';

        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (value) {
            let delta = '';

            if (typeof value === 'string') {
              delta = value;
            } else if (isText(value)) {
              response = value.text;
            } else if (isImages(value)) {
              response = value.images;
            } else {
              delta = decoder.decode(value);
            }

            if (typeof response === 'string' && delta) {
              response += delta;
            }

            setMessages((v) =>
              produce(v, (draft) => {
                const item = draft.find((i) => i.id === id);
                if (!item || item.loading === false) {
                  return;
                }

                item.response = response;
                item.loading = !done;
              })
            );

            scrollToBottom?.();
          }

          if (done) {
            break;
          }
        }
        return { id, text: response };
      } catch (error) {
        setMessages((v) =>
          produce(v, (draft) => {
            const item = draft.find((i) => i.id === id);
            if (item) item.error = error;
          })
        );
        return null;
      } finally {
        setMessages((v) =>
          produce(v, (draft) => {
            const item = draft.find((i) => i.id === id);
            if (item) item.loading = false;
          })
        );
      }
    },
    [imageGenerations, scrollToBottom, textCompletions]
  );

  const cancel = useCallback(({ id }: Pick<MessageItem, 'id'>) => {
    setMessages((v) =>
      produce(v, (draft) => {
        const i = draft.find((i) => i.id === id);
        if (i) i.loading = false;
      })
    );
  }, []);

  const clearHistory = useCallback(() => {
    const initialMessage = {
      id: nextId(),
      response: 'Hi, I am AIGNE Hub! How can I assist you today?',
      timestamp: Date.now(),
    };
    setMessages([initialMessage]);
    if (enableCache) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [enableCache]);

  return { messages, add, cancel, setMessages, clearHistory };
}
