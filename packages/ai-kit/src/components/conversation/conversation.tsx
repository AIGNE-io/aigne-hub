import { Avatar, Box, BoxProps, CircularProgress, Fade } from '@mui/material';
import isNil from 'lodash/isNil';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { ReactNode, RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import CreditErrorAlert from '../credit/alert';
import ImagePreview from '../image-preview';
import Message from './message';
import Prompt, { PromptProps } from './prompt';

export interface MessageItem {
  id: string;
  prompt?: string | ChatCompletionMessageParam[];
  response?: string | { url: string }[];
  loading?: boolean;
  error?: { message: string; [key: string]: unknown };
  meta?: any;
  timestamp?: number;
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
  chatLayout = 'left-right',
  ...props
}: Omit<BoxProps, 'onSubmit'> & {
  messages: MessageItem[];
  onSubmit: (prompt: string) => void;
  customActions?: (item: MessageItem) => Array<ReactNode[]>;
  renderAvatar?: (item: MessageItem, isAI: boolean) => ReactNode;
  scrollContainer?: HTMLElement;
  promptProps?: Partial<PromptProps>;
  chatLayout?: 'traditional' | 'left-right';
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
      <Box
        sx={{ mt: 3, mx: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}
        className="conversation-container">
        <Box sx={{ flexGrow: 1, width: '100%', mx: 'auto', maxWidth }}>
          {messages.map((msg) => {
            const actions = customActions?.(msg);
            const isLeftRight = chatLayout === 'left-right';

            return (
              <Fade in key={msg.id} timeout={300}>
                <Box id={`conversation-${msg.id}`}>
                  {!isNil(msg.prompt) && (
                    <Message
                      avatar={renderAvatar?.(msg, false) ?? <Avatar sx={{ bgcolor: 'secondary.main' }}>🧑</Avatar>}
                      message={msg.prompt}
                      actions={actions?.[0]}
                      timestamp={msg.timestamp}
                      isUser={isLeftRight}
                      chatLayout={chatLayout}
                    />
                  )}
                  {(!isNil(msg.response) || !isNil(msg.loading) || !isNil(msg.error)) && (
                    <Message
                      id={`response-${msg.id}`}
                      loading={msg.loading && !!msg.response}
                      message={typeof msg.response === 'string' ? msg.response : undefined}
                      avatar={renderAvatar?.(msg, true) ?? <Avatar sx={{ bgcolor: 'primary.main' }}>🤖️</Avatar>}
                      actions={actions?.[1]}
                      timestamp={msg.timestamp}
                      isUser={false}
                      chatLayout={chatLayout}>
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
                        // @ts-ignore
                        <CreditErrorAlert error={msg.error} />
                      ) : (
                        msg.loading &&
                        !msg.response && (
                          <Box
                            sx={{
                              minHeight: 32,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              color: 'text.secondary',
                              fontSize: '14px',
                            }}>
                            <CircularProgress size={18} thickness={4} />
                            <span>AI is thinking...</span>
                          </Box>
                        )
                      )}
                    </Message>
                  )}
                </Box>
              </Fade>
            );
          })}

          {element}
        </Box>

        <Box sx={{ mx: 'auto', width: '100%', maxWidth, position: 'sticky', bottom: 0 }}>
          <Box
            sx={{
              height: 24,
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
