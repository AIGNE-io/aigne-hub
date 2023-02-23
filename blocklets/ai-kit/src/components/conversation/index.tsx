import { ImagePreview } from '@blocklet/ai-kit';
import { cx } from '@emotion/css';
import styled from '@emotion/styled';
import { Cancel, CopyAll, Error, Send } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  BoxProps,
  Button,
  CircularProgress,
  IconButton,
  Input,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import { useHistoryTravel } from 'ahooks';
import { AxiosError } from 'axios';
import produce from 'immer';
import { nanoid } from 'nanoid';
import { ReactNode, RefObject, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { AIImageResponse, ImageGenerationSize, completions, imageGenerations } from '../../libs/ai';

const nextId = () => nanoid(16);

const STICKY_SCROLL_BOTTOM_GAP = 20;

export interface ConversationRef extends ReturnType<typeof useConversation> {}

export default forwardRef<ConversationRef, BoxProps>(({ maxWidth, ...props }: BoxProps, ref) => {
  const scroller = useRef<HTMLDivElement>(null);
  const conversation = useConversation({ scroller });
  const { scrollToBottomElement, scrollToBottom, conversations, addConversation, cancelConversation } = conversation;

  useImperativeHandle(ref, () => conversation);

  return (
    <Box
      {...props}
      ref={scroller}
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        ...props.sx,
      }}>
      <Box sx={{ mt: 2, mx: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flexGrow: 1, width: '100%', mx: 'auto', maxWidth }}>
          {conversations.map((item) => (
            <Box key={item.id} id={`conversation-${item.id}`}>
              <ConversationItemView avatar={<Avatar sx={{ bgcolor: 'secondary.main' }} />} text={item.prompt} />
              <ConversationItemView
                my={1}
                id={`response-${item.id}`}
                text={typeof item.response === 'string' ? item.response : undefined}
                showCursor={!!item.response && item.writing}
                avatar={<Avatar sx={{ bgcolor: 'primary.main' }}>AI</Avatar>}
                onCancel={item.writing ? () => cancelConversation(item.id) : undefined}>
                {typeof item.response === 'object' && (
                  <ImagePreview
                    itemWidth={100}
                    dataSource={item.response.data.map((item) => {
                      return {
                        src: item.url,
                        onLoad: () => scrollToBottom(),
                      };
                    })}
                  />
                )}
                {item.error ? (
                  <Alert color="error" icon={<Error />} sx={{ px: 1, py: 0 }}>
                    {(item.error as AxiosError<{ message: string }>).response?.data?.message || item.error.message}
                  </Alert>
                ) : (
                  !item.response && (
                    <Box minHeight={24} display="flex" alignItems="center">
                      <CircularProgress size={16} />
                    </Box>
                  )
                )}
              </ConversationItemView>
            </Box>
          ))}

          {scrollToBottomElement}
        </Box>

        <Box sx={{ mx: 'auto', width: '100%', maxWidth, position: 'sticky', bottom: 0 }}>
          <Box height={16} sx={{ pointerEvents: 'none', background: 'linear-gradient(transparent, white)' }} />
          <Box pb={2} sx={{ bgcolor: 'background.paper' }}>
            <Prompt onSubmit={addConversation} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

export interface ConversationItem {
  id: string;
  prompt: string;
  response?: string | AIImageResponse;
  writing?: boolean;
  error?: Error;
}

function useConversation({ scroller }: { scroller: RefObject<HTMLDivElement> }) {
  const { element: scrollToBottomElement, scrollToBottom } = useAutoScrollToBottom({ scroller });

  const [conversations, setConversations] = useState<ConversationItem[]>(() => [
    { id: nextId(), prompt: 'Hi!', response: 'Hi, I am AI Kit from ArcBlock!' },
  ]);

  const addConversation = useCallback(async (prompt: string) => {
    const id = nextId();
    setConversations((v) => v.concat({ id, prompt }));
    scrollToBottom({ force: true });

    try {
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
          size: `${size}x${size}` as ImageGenerationSize,
        });
        setConversations((v) =>
          produce(v, (draft) => {
            const item = draft.find((i) => i.id === id);
            if (!item || item.writing === false) {
              return;
            }

            item.response = response;
          })
        );
        return;
      }

      const response = await completions({ prompt, stream: true });

      const reader = response.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { value, done } = await reader.read();
        const chunkValue = decoder.decode(value);
        setConversations((v) =>
          produce(v, (draft) => {
            const item = draft.find((i) => i.id === id);
            if (!item || item.writing === false) {
              return;
            }

            item.response ??= '';
            item.response += chunkValue;
            item.writing = !done;
          })
        );

        scrollToBottom();

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
            item.writing = false;
          }
        })
      );

      throw error;
    }
  }, []);

  const cancelConversation = useCallback((id: string) => {
    setConversations((v) =>
      produce(v, (draft) => {
        const i = draft.find((i) => i.id === id);
        if (i) i.writing = false;
      })
    );
  }, []);

  return { scrollToBottomElement, scrollToBottom, conversations, addConversation, cancelConversation };
}

const useAutoScrollToBottom = ({ scroller }: { scroller: RefObject<HTMLDivElement> }) => {
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
      setTimeout(() => {
        element.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, []);

  return { element: <div ref={element} />, scrollToBottom };
};

function ConversationItemView({
  text,
  children,
  showCursor,
  avatar,
  onCancel,
  ...props
}: { text?: string; children?: ReactNode; showCursor?: boolean; avatar: ReactNode; onCancel?: () => void } & BoxProps) {
  const [copied, setCopied] = useState<'copied' | boolean>(false);

  return (
    <ItemRoot {...props} display="flex">
      <AvatarWrapper mr={1}>{avatar}</AvatarWrapper>

      <Box className={cx('message', showCursor && 'cursor')}>
        {text}
        {children}

        {!!text && (
          <Box className="actions">
            {onCancel && (
              <Tooltip title="Stop" placement="top">
                <Button size="small" onClick={onCancel}>
                  <Cancel fontSize="small" />
                </Button>
              </Tooltip>
            )}

            <Tooltip title={copied === 'copied' ? 'Copied!' : 'Copy'} placement="top" open={Boolean(copied)}>
              <Button
                size="small"
                className={cx('copy', copied && 'active')}
                onMouseEnter={() => setCopied(true)}
                onMouseLeave={() => setCopied(false)}
                onClick={() => {
                  navigator.clipboard.writeText(text);
                  setCopied('copied');
                  setTimeout(() => setCopied(false), 1500);
                }}>
                <CopyAll fontSize="small" />
              </Button>
            </Tooltip>
          </Box>
        )}
      </Box>
    </ItemRoot>
  );
}

const ItemRoot = styled(Box)`
  > .message {
    flex: 1;
    overflow: hidden;
    word-break: break-word;
    white-space: pre-wrap;
    padding: 3px 8px;
    border-radius: 4px;
    position: relative;

    &.cursor {
      &:after {
        content: '';
        display: inline-block;
        vertical-align: middle;
        height: 1em;
        margin-top: -0.15em;
        margin-left: 0.15em;
        border-right: 0.15em solid orange;
        animation: blink-caret 0.75s step-end infinite;

        @keyframes blink-caret {
          from,
          to {
            border-color: transparent;
          }
          50% {
            border-color: orange;
          }
        }
      }
    }

    > .actions {
      position: absolute;
      right: 2px;
      top: 2px;
      background-color: rgba(0, 0, 0, 0.4);
      border-radius: 4px;
      display: none;

      &.active {
        display: flex;
      }

      button {
        min-width: 0;
        padding: 0;
        height: 24px;
        width: 22px;
        color: white;
      }
    }
  }

  &:hover {
    > .message {
      background-color: rgba(0, 0, 0, 0.05);

      > .actions {
        display: flex;
      }
    }
  }
`;

const AvatarWrapper = styled(Box)`
  > .MuiAvatar-root {
    width: 30px;
    height: 30px;
  }
`;

function Prompt({ onSubmit }: { onSubmit: (prompt: string) => any }) {
  const [prompt, setPrompt] = useState('');
  const { value: historyPrompt, setValue: setHistoryPrompt, forwardLength, back, go, forward } = useHistoryTravel('');
  const submit = () => {
    go(forwardLength);
    // wait for history to set before submitting
    setTimeout(() => {
      setHistoryPrompt(prompt);
      onSubmit(prompt);
      setPrompt('');
    }, 50);
  };

  return (
    <Box
      component="form"
      sx={{ boxShadow: 2, margin: 'auto', px: 1, borderRadius: 1 }}
      onSubmit={(e) => e.preventDefault()}>
      <Input
        fullWidth
        disableUnderline
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          // if pressed up
          if (e.keyCode === 38) {
            back();
            setPrompt(historyPrompt || '');
            e.preventDefault();
          } else if (e.keyCode === 40) {
            forward();
            setPrompt(historyPrompt || '');
            e.preventDefault();
          }
        }}
        endAdornment={
          <InputAdornment position="end">
            <IconButton onClick={submit} size="small" type="submit">
              <Send fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
      />
    </Box>
  );
}
