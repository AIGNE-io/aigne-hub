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
  textCompletions: (prompt: string, options: { meta?: any }) => Promise<ReadableStream<any>>;
  imageGenerations?: (
    prompt: { prompt: string; n: number; size: string },
    options: { meta?: any }
  ) => Promise<{ url: string }[]>;
}) {
  const [messages, setMessages] = useState<MessageItem[]>(() => [
    { id: nextId(), response: 'Hi, I am AI Kit! How can I assist you today?' },
  ]);

  const add = useCallback(
    async (prompt: string, meta?: any) => {
      const id = nextId();
      setMessages((v) => v.concat({ id, prompt, loading: true, meta }));
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

        const response = await textCompletions(prompt, { meta });

        const reader = response.getReader();
        const decoder = new TextDecoder();

        let text = '';

        for (;;) {
          const { value, done } = await reader.read();
          const chunkValue = decoder.decode(value);
          text += chunkValue;

          setMessages((v) =>
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
        return { id, text };
      } catch (error) {
        setMessages((v) =>
          produce(v, (draft) => {
            const item = draft.find((i) => i.id === id);
            if (item) item.error = error;
          })
        );

        throw error;
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

  return { messages, add, cancel, setMessages };
}
