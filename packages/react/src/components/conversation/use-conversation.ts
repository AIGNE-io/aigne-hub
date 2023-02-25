import produce from 'immer';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { MessageItem } from './conversation';

const nextId = () => nanoid(16);

export default function useConversation({
  scrollToBottom,
  textCompletions,
  imageGenerations,
}: {
  scrollToBottom?: (options?: { force?: boolean }) => void;
  textCompletions: (prompt: string) => Promise<ReadableStream<any>>;
  imageGenerations?: (prompt: { prompt: string; n: number; size: string }) => Promise<{ url: string }[]>;
}) {
  const [messages, setConversations] = useState<MessageItem[]>(() => [
    { id: nextId(), prompt: 'Hi!', response: 'Hi, I am AI Kit from ArcBlock!' },
  ]);

  const add = useCallback(
    async (prompt: string, meta?: any) => {
      const id = nextId();
      setConversations((v) => v.concat({ id, prompt, meta }));
      scrollToBottom?.({ force: true });

      try {
        if (imageGenerations) {
          const m = prompt.match(/^\/image(\s+(?<size>256|512|1024))?(\s+(?<n>[1-9]|10))?\s+(?<prompt>[\s\S]+)/);
          if (m?.groups) {
            const {
              size = '256',
              n = '1',
              prompt,
            } = m.groups as any as { size: '256' | '512' | '1024'; n: string; prompt: string };
            const response = await imageGenerations({
              prompt,
              n: parseInt(n, 10),
              size: `${size}x${size}`,
            });

            setConversations((v) =>
              produce(v, (draft) => {
                const item = draft.find((i) => i.id === id);
                if (!item || item.loading === false) {
                  return;
                }

                item.response = response;
              })
            );
            return;
          }
        }

        const response = await textCompletions(prompt);

        const reader = response.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { value, done } = await reader.read();
          const chunkValue = decoder.decode(value);
          setConversations((v) =>
            produce(v, (draft) => {
              const item = draft.find((i) => i.id === id);
              if (!item || item.loading === false) {
                return;
              }

              item.response ??= '';
              item.response += chunkValue;
              item.loading = !done;
            })
          );

          scrollToBottom?.();

          if (done) {
            break;
          }
        }
      } catch (error) {
        setConversations((v) =>
          produce(v, (draft) => {
            const item = draft.find((i) => i.id === id);
            if (item) {
              item.error = error;
              item.loading = false;
            }
          })
        );

        throw error;
      }
    },
    [imageGenerations, scrollToBottom, textCompletions]
  );

  const cancel = useCallback(({ id }: Pick<MessageItem, 'id'>) => {
    setConversations((v) =>
      produce(v, (draft) => {
        const i = draft.find((i) => i.id === id);
        if (i) i.loading = false;
      })
    );
  }, []);

  return { messages, add, cancel };
}
