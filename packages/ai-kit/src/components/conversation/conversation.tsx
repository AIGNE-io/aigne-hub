import { Avatar, Box, BoxProps, CircularProgress } from '@mui/material';
import isNil from 'lodash/isNil';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { ReactNode, RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import ImagePreview from '../image-preview';
import SubscribeErrorAlert from '../subscribe/alert';
import Message from './message';
import Prompt, { PromptProps } from './prompt';

export interface MessageItem {
  id: string;
  prompt?: string | ChatCompletionMessageParam[];
  response?: string | { url: string }[];
  loading?: boolean;
  error?: { message: string; [key: string]: unknown };
  meta?: any;
}

export interface ConversationRef {
  scrollToBottom: (options?: { force?: boolean }) => void;
}

export default function Conversation({
  ref,
  messages,
  onSubmit,
  customActions = () => [],
  renderAvatar = undefined,
  maxWidth = 1000,
  scrollContainer = undefined,
  promptProps = {},
  ...props
}: Omit<BoxProps, 'onSubmit'> & {
  messages: MessageItem[];
  onSubmit: (prompt: string) => void;
  customActions?: (item: MessageItem) => Array<ReactNode[]>;
  renderAvatar?: (item: MessageItem, isAI: boolean) => ReactNode;
  scrollContainer?: HTMLElement;
  promptProps?: Partial<PromptProps>;
}) {
  const scroller = useRef<HTMLElement>(scrollContainer ?? null);
  const { element, scrollToBottom } = useAutoScrollToBottom({ scroller });

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
    }),
    [scrollToBottom]
  );

  return (
    <Box
      {...props}
      ref={scrollContainer ? undefined : scroller}
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        ...props.sx,
      }}>
      <Box sx={{ mt: 2, mx: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flexGrow: 1, width: '100%', mx: 'auto', maxWidth }}>
          {messages.map((msg) => {
            const actions = customActions?.(msg);

            return (
              <Box key={msg.id} id={`conversation-${msg.id}`}>
                {!isNil(msg.prompt) && (
                  <Message
                    avatar={renderAvatar?.(msg, false) ?? <Avatar sx={{ bgcolor: 'secondary.main' }}>🧑</Avatar>}
                    message={msg.prompt}
                    actions={actions?.[0]}
                  />
                )}
                {(!isNil(msg.response) || !isNil(msg.loading) || !isNil(msg.error)) && (
                  <Message
                    my={1}
                    id={`response-${msg.id}`}
                    loading={msg.loading && !!msg.response}
                    message={typeof msg.response === 'string' ? msg.response : undefined}
                    avatar={renderAvatar?.(msg, true) ?? <Avatar sx={{ bgcolor: 'primary.main' }}>🤖️</Avatar>}
                    actions={actions?.[1]}>
                    {Array.isArray(msg.response) && (
                      <ImagePreview
                        itemWidth={100}
                        dataSource={msg.response.map(({ url }) => {
                          return {
                            src: url,
                            onLoad: () => scrollToBottom(),
                          };
                        })}
                      />
                    )}
                    {msg.error ? (
                      <SubscribeErrorAlert error={msg.error} />
                    ) : (
                      msg.loading &&
                      !msg.response && (
                        <Box
                          sx={{
                            minHeight: 24,
                            display: 'flex',
                            alignItems: 'center',
                          }}>
                          <CircularProgress size={16} />
                        </Box>
                      )
                    )}
                  </Message>
                )}
              </Box>
            );
          })}

          {element}
        </Box>

        <Box sx={{ mx: 'auto', width: '100%', maxWidth, position: 'sticky', bottom: 0 }}>
          <Box
            sx={{
              height: 16,
              pointerEvents: 'none',
              background: (theme) => `linear-gradient(transparent, ${theme.palette.background.paper})`,
            }}
          />
          <Box
            sx={{
              pb: 2,
              bgcolor: 'background.paper',
            }}>
            <Prompt onSubmit={onSubmit} {...promptProps} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const STICKY_SCROLL_BOTTOM_GAP = 5;

const useAutoScrollToBottom = ({ scroller }: { scroller: RefObject<HTMLElement | null> }) => {
  const element = useRef<HTMLDivElement>(null);
  const enableAutoScrollBottom = useRef(true);

  useEffect(() => {
    const e = scroller.current;
    if (!e) {
      return () => {};
    }

    const listener = () => {
      enableAutoScrollBottom.current = e.clientHeight + e.scrollTop >= e.scrollHeight - STICKY_SCROLL_BOTTOM_GAP;
    };
    e.addEventListener('scroll', listener);
    return () => e.removeEventListener('scroll', listener);
  }, [scroller]);

  const scrollToBottom = useCallback(({ force }: { force?: boolean } = {}) => {
    if (force || enableAutoScrollBottom.current) {
      setTimeout(() => (element.current as any)?.scrollIntoViewIfNeeded?.());
    }
  }, []);

  return { element: <div ref={element} />, scrollToBottom };
};
