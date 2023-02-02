import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
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
import { AxiosError } from 'axios';
import produce from 'immer';
import { nanoid } from 'nanoid';
import { ReactNode, useState } from 'react';

import { completions } from '../../libs/ai';

const nextId = () => nanoid(16);

export default function Playground() {
  const [conversations, setConversations] = useState<
    { id: string; prompt: string; response?: string; writing?: boolean; error?: Error }[]
  >(() => [{ id: nextId(), prompt: 'Hi!', response: 'Hi, I am AI Kit from ArcBlock!' }]);

  return (
    <>
      <Box sx={{ position: 'sticky', zIndex: 100, top: 0 }}>
        <Header maxWidth={null} />
      </Box>

      <Box flexGrow={1} m={2}>
        <Box maxWidth={800} mx="auto" overflow="auto">
          {conversations.map((item) => (
            <Box key={item.id} id={`conversation-${item.id}`}>
              <ConversationItem avatar={<Avatar sx={{ bgcolor: 'secondary.main' }} />}>{item.prompt}</ConversationItem>
              <ConversationItem
                my={1}
                id={`response-${item.id}`}
                showCursor={!!item.response && item.writing}
                avatar={<Avatar sx={{ bgcolor: 'primary.main' }}>AI</Avatar>}
                onCancel={
                  item.writing
                    ? () => {
                        setConversations((v) =>
                          produce(v, (draft) => {
                            const i = draft.find((i) => i.id === item.id);
                            if (i) i.writing = false;
                          })
                        );
                      }
                    : undefined
                }>
                {item.error ? (
                  <Alert color="error" icon={<Error />}>
                    {(item.error as AxiosError<{ message: string }>).response?.data?.message || item.error.message}
                  </Alert>
                ) : item.response ? (
                  item.response
                ) : (
                  <Box minHeight={24} display="flex" alignItems="center">
                    <CircularProgress size={16} />
                  </Box>
                )}
              </ConversationItem>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ position: 'sticky', bottom: 0 }}>
        <Box height={16} sx={{ pointerEvents: 'none', background: 'linear-gradient(transparent, white)' }} />
        <Box mx={2} pb={2} sx={{ bgcolor: 'background.paper' }}>
          <Box maxWidth={800} mx="auto">
            <Prompt
              onSubmit={async (prompt) => {
                const id = nextId();
                setConversations((v) => v.concat({ id, prompt }));
                setTimeout(() => {
                  document.getElementById(`conversation-${id}`)?.scrollIntoView({ behavior: 'smooth' });
                });
                try {
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
                      }
                    })
                  );

                  throw error;
                } finally {
                  setTimeout(() => {
                    document.getElementById(`response-${id}`)?.scrollIntoView({ behavior: 'smooth' });
                  });
                }
              }}
            />
          </Box>
        </Box>

        <Box sx={{ bgcolor: 'background.paper' }}>
          <Footer />
        </Box>
      </Box>
    </>
  );
}

function ConversationItem({
  children,
  showCursor,
  avatar,
  onCancel,
  ...props
}: { children: ReactNode; showCursor?: boolean; avatar: ReactNode; onCancel?: () => void } & BoxProps) {
  const [copied, setCopied] = useState(false);

  return (
    <ItemRoot {...props} display="flex">
      <AvatarWrapper mr={1}>{avatar}</AvatarWrapper>

      <Box className={cx('message', showCursor && 'cursor')}>
        {children}

        {typeof children === 'string' && (
          <Box className="actions">
            {onCancel && (
              <Tooltip title="Stop" placement="top">
                <Button size="small" onClick={onCancel}>
                  <Cancel fontSize="small" />
                </Button>
              </Tooltip>
            )}

            <Tooltip
              title="Copied!"
              placement="top"
              open={copied}
              disableFocusListener
              disableHoverListener
              disableTouchListener>
              <Button
                size="small"
                className={cx('copy', copied && 'active')}
                onClick={() => {
                  navigator.clipboard.writeText(children);
                  setCopied(true);
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
  const submit = () => {
    onSubmit(prompt);
    setPrompt('');
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
