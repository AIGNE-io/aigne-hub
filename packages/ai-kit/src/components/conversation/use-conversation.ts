import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { useCallback, useEffect, useState } from 'react';

import type { MessageItem, VideoResponse } from './conversation';

const nextId = () => nanoid(16);
const DEFAULT_STORAGE_KEY = 'aigne-hub-conversation-history';
const DEFAULT_SESSION_STORAGE_KEY = 'aigne-hub-conversation-session';
const MAX_CACHED_MESSAGES = 5; // Limit cached messages to reduce storage usage

// Load messages from localStorage/sessionStorage
const loadMessages = async (storageKey: string, sessionStorageKey: string): Promise<MessageItem[]> => {
  try {
    // Try localStorage first, then sessionStorage as fallback
    let cached = localStorage.getItem(storageKey);
    if (!cached) {
      cached = sessionStorage.getItem(sessionStorageKey);
    }
    if (cached) {
      const parsed = JSON.parse(cached);
      // Validate and filter out invalid messages
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validMessages = parsed.filter((msg) => msg.id && (msg.prompt || msg.response));
        return validMessages;
      }
    }
  } catch (error) {
    console.warn('Failed to load conversation history:', error);
  }

  // Return empty array if no history, let the component handle initial message
  return [];
};

// Save messages to localStorage
const saveMessages = async (messages: MessageItem[], storageKey: string, sessionStorageKey: string) => {
  try {
    // Only save completed messages (no loading state)
    const toSave = messages
      .filter((msg) => !msg.loading)
      .slice(-MAX_CACHED_MESSAGES) // Keep only last N messages
      .map((msg) => {
        // Replace image data URLs with placeholders to save storage space
        let response = msg?.response;

        if (response && typeof response === 'object' && 'images' in response && response.images) {
          response = {
            ...response,
            images: (response.images || []).map((img: any) => ({
              ...img,
              url: img?.url && img.url.startsWith('data:') ? '[IMAGE_PLACEHOLDER]' : img.url,
            })),
          };
        }

        if (response && typeof response === 'object' && 'videos' in response && response.videos) {
          response = {
            ...response,
            videos: (response.videos || []).map((video: any) => ({
              ...video,
              data: video?.data && video.data.startsWith('data:') ? '[VIDEO_PLACEHOLDER]' : video.data,
            })),
          };
        }

        return {
          id: msg.id,
          prompt: msg.prompt,
          response,
          timestamp: msg.timestamp,
          // Don't save meta and error state to reduce size
        };
      });

    // Try to save to localStorage, fallback to sessionStorage if quota exceeded
    try {
      localStorage.setItem(storageKey, JSON.stringify(toSave));
      // Clear sessionStorage if localStorage succeeded
      sessionStorage.removeItem(sessionStorageKey);
    } catch (storageError) {
      if (storageError instanceof Error && storageError.name === 'QuotaExceededError') {
        // Fallback to sessionStorage
        try {
          sessionStorage.setItem(sessionStorageKey, JSON.stringify(toSave));
        } catch (sessionError) {
          console.warn('Failed to save to sessionStorage:', sessionError);
        }
      } else {
        console.warn('Failed to save to localStorage:', storageError);
      }
    }
  } catch (error) {
    console.warn('Failed to save conversation history:', error);
  }
};

export default function useConversation({
  scrollToBottom,
  textCompletions,
  imageGenerations,
  enableCache = true,
  storageKeyPrefix,
}: {
  scrollToBottom?: (options?: { force?: boolean }) => void;
  textCompletions: (
    prompt: string | ChatCompletionMessageParam[],
    options: { meta?: any }
  ) => Promise<
    ReadableStream<
      | string
      | Uint8Array
      | { type: 'text'; text: string }
      | { type: 'images'; images: { url: string }[] }
      | { type: 'video'; videos: VideoResponse[] }
    >
  >;
  imageGenerations?: (
    prompt: { prompt: string; n: number; size: string },
    options: { meta?: any }
  ) => Promise<{ url: string }[]>;
  enableCache?: boolean;
  storageKeyPrefix?: string;
}) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(enableCache);

  // Use user-specific storage keys if prefix provided
  const STORAGE_KEY = storageKeyPrefix ? `${storageKeyPrefix}-conversation-history` : DEFAULT_STORAGE_KEY;
  const SESSION_STORAGE_KEY = storageKeyPrefix
    ? `${storageKeyPrefix}-conversation-session`
    : DEFAULT_SESSION_STORAGE_KEY;

  // Load messages from cache (runs on mount and when STORAGE_KEY changes)
  useEffect(() => {
    if (!enableCache) {
      setMessages([
        { id: nextId(), response: 'Hi, I am AIGNE Hub! How can I assist you today?', timestamp: Date.now() },
      ]);
      return;
    }

    setIsLoadingHistory(true);
    setIsInitialLoad(true);

    // Load from storage
    loadMessages(STORAGE_KEY, SESSION_STORAGE_KEY).then((loadedMessages) => {
      // If no messages loaded from new key, try to migrate from old key (one-time migration)
      if (loadedMessages.length === 0 && storageKeyPrefix) {
        // Try loading from old keys
        loadMessages(DEFAULT_STORAGE_KEY, DEFAULT_SESSION_STORAGE_KEY).then((oldMessages) => {
          if (oldMessages.length > 0) {
            // eslint-disable-next-line no-console
            console.log('Migrating conversation history from old storage key to user-specific key');
            setMessages(oldMessages);
            // Save to new key
            saveMessages(oldMessages, STORAGE_KEY, SESSION_STORAGE_KEY).catch((error) => {
              console.warn('Failed to migrate messages:', error);
            });
            // Clean up old keys after successful migration
            localStorage.removeItem(DEFAULT_STORAGE_KEY);
            sessionStorage.removeItem(DEFAULT_SESSION_STORAGE_KEY);
          } else {
            // No old data either, show welcome message
            setMessages([
              { id: nextId(), response: 'Hi, I am AIGNE Hub! How can I assist you today?', timestamp: Date.now() },
            ]);
          }
          setIsLoadingHistory(false);
        });
      } else {
        // Messages loaded from new key, or no migration needed
        if (loadedMessages.length === 0) {
          setMessages([
            { id: nextId(), response: 'Hi, I am AIGNE Hub! How can I assist you today?', timestamp: Date.now() },
          ]);
        } else {
          setMessages(loadedMessages);
        }
        setIsLoadingHistory(false);
      }
    });
  }, [enableCache, STORAGE_KEY, SESSION_STORAGE_KEY, storageKeyPrefix]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (isInitialLoad && messages.length > 0 && !isLoadingHistory) {
      // Wait for DOM to render
      setTimeout(() => {
        scrollToBottom?.({ force: true });
        setIsInitialLoad(false);
      }, 100);
    }
  }, [isInitialLoad, messages.length, scrollToBottom, isLoadingHistory]);

  // Save messages to localStorage whenever they change (with debounce)
  useEffect(() => {
    if (enableCache && messages.length > 0) {
      const timeoutId = setTimeout(() => {
        saveMessages(messages, STORAGE_KEY, SESSION_STORAGE_KEY).catch((error) => {
          console.error('❌ Failed to save messages:', error);
        });
      }, 1000); // Delay save by 1 second to avoid saving during streaming

      return () => clearTimeout(timeoutId);
    }
    return () => {};
  }, [messages, enableCache, STORAGE_KEY, SESSION_STORAGE_KEY]);

  const add = useCallback(
    async (prompt: string | ChatCompletionMessageParam[], meta?: any) => {
      const id = nextId();
      const timestamp = Date.now();

      setMessages((v) => v.concat({ id, prompt, loading: true, meta, timestamp }));
      setTimeout(() => {
        scrollToBottom?.({ force: true });
      }, 100);

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
        const isVideo = (i: any): i is { type: 'video'; videos: VideoResponse[] } => i.type === 'video';

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
              response = { images: value.images };
            } else if (isVideo(value)) {
              response = { videos: value.videos };
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
            if (item) {
              item.error = error;
            }
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

  const clearHistory = useCallback(async () => {
    const initialMessage = {
      id: nextId(),
      response: 'Hi, I am AIGNE Hub! How can I assist you today?',
      timestamp: Date.now(),
    };
    setMessages([initialMessage]);
    if (enableCache) {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [enableCache, STORAGE_KEY, SESSION_STORAGE_KEY]);

  return {
    messages,
    add,
    cancel,
    setMessages,
    clearHistory,
    isLoadingHistory,
  };
}
