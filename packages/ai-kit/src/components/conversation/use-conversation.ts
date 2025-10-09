import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { useCallback, useEffect, useState } from 'react';

import { MessageItem } from './conversation';

const nextId = () => nanoid(16);
const STORAGE_KEY = 'aigne-hub-conversation-history';
const MAX_CACHED_MESSAGES = 50; // Limit cached messages

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
      .map((msg) => {
        // Remove base64 image data to save storage space
        const response =
          msg.response && typeof msg.response === 'object' && 'images' in msg.response
            ? {
                ...msg.response,
                images: (msg.response as any).images?.map((img: any) => ({
                  ...img,
                  url: img.url?.includes('data:') ? '[CACHED_IMAGE_DATA]' : img.url,
                })),
              }
            : msg.response;

        return {
          id: msg.id,
          prompt: msg.prompt,
          response,
          timestamp: msg.timestamp,
          meta: msg.meta,
          // Don't save error state
        };
      });
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
    async (prompt: string | ChatCompletionMessageParam[], meta?: any) => {
      const id = nextId();
      const timestamp = Date.now();

      setMessages((v) => v.concat({ id, prompt, loading: true, meta, timestamp }));
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

        const result = await textCompletions(prompt, { meta });

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
