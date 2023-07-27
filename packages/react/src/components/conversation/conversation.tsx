import { Error } from '@mui/icons-material';
import { Alert, Avatar, Box, BoxProps, CircularProgress } from '@mui/material';
import isNil from 'lodash/isNil';
import { ChatCompletionRequestMessage } from 'openai';
import { ReactNode, RefObject, forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import ImagePreview from '../image-preview';
import Message from './message';
import Prompt, { PromptProps } from './prompt';

export interface MessageItem {
  id: string;
  prompt?: string | ChatCompletionRequestMessage[];
  response?: string | { url: string }[];
  loading?: boolean;
  error?: { message: string };
  meta?: any;
}

export interface ConversationRef {
  scrollToBottom: (options?: { force?: boolean }) => void;
}

export default forwardRef<
  ConversationRef,
  Omit<BoxProps, 'onSubmit'> & {
    messages: MessageItem[];
    onSubmit: (prompt: string) => void;
    customActions?: (item: MessageItem) => [ReactNode[], ReactNode[]];
    renderAvatar?: (item: MessageItem, isAI: boolean) => ReactNode;
    scrollContainer?: HTMLElement;
    promptProps?: Partial<PromptProps>;
  }
>(({ messages, onSubmit, customActions, renderAvatar, maxWidth, scrollContainer, promptProps, ...props }, ref) => {
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
                      <Alert color="warning" icon={<Error />} sx={{ px: 1, py: 0 }}>
                        {msg.error.message}
                      </Alert>
                    ) : (
                      msg.loading &&
                      !msg.response && (
                        <Box minHeight={24} display="flex" alignItems="center">
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
          <Box height={16} sx={{ pointerEvents: 'none', background: 'linear-gradient(transparent, white)' }} />
          <Box pb={2} sx={{ bgcolor: 'background.paper' }}>
            <Prompt onSubmit={onSubmit} {...promptProps} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

const STICKY_SCROLL_BOTTOM_GAP = 5;

const useAutoScrollToBottom = ({ scroller }: { scroller: RefObject<HTMLElement> }) => {
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
