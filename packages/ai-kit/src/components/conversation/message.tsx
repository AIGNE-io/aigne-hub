import { cx } from '@emotion/css';
import styled from '@emotion/styled';
import { CheckCircleOutline, CopyAll } from '@mui/icons-material';
import { Box, BoxProps, Button, Tooltip } from '@mui/material';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { Attachment } from '../../api/types';

export interface MessageProps extends BoxProps {
  avatar?: ReactNode;
  message?: string | ChatCompletionMessageParam[];
  children?: ReactNode;
  loading?: boolean;
  actions?: ReactNode[];
  timestamp?: number;
  isUser?: boolean;
  chatLayout?: 'traditional' | 'left-right';
  attachments?: Attachment[];
}

export default function Message({
  avatar = undefined,
  message = undefined,
  children = undefined,
  loading = false,
  actions = undefined,
  timestamp = undefined,
  isUser = false,
  chatLayout = 'traditional',
  attachments = undefined,
  ...props
}: MessageProps) {
  const text = useMemo(
    () => (typeof message === 'string' ? message : message?.map((i) => `${i.role}: ${i.content}`).join('\n\n')),
    [message]
  );

  // Force re-render every minute to update relative time
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timestamp) return undefined;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [timestamp]);

  const formattedTime = useMemo(() => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }, [timestamp, now]);

  const isLeftRight = chatLayout === 'left-right';

  return (
    <Root
      {...props}
      display="flex"
      className={cx(isLeftRight && isUser && 'user-message', isLeftRight && !isUser && 'ai-message')}
      sx={{
        mb: 2.5,
        '&:hover .message-meta': {
          opacity: 1,
        },
        ...(isLeftRight && isUser
          ? {
              justifyContent: 'flex-end',
              '.avatar': { order: 2, mr: 0, ml: 1 },
              '.content': { alignItems: 'flex-end' },
              '.message-meta .actions button': {
                bgcolor: 'rgba(255, 255, 255, 0.15) !important',
                color: 'rgba(255, 255, 255, 0.9) !important',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.25) !important',
                  color: 'white !important',
                },
              },
            }
          : {}),
        ...props.sx,
      }}>
      <Box
        className="avatar"
        sx={{
          pt: 0.625,
          flexShrink: 0,
          mr: isLeftRight && !isUser ? 1 : isLeftRight && isUser ? 0 : 1,
          ml: isLeftRight && isUser ? 1 : 0,
          '& .MuiAvatar-root': {
            width: 38,
            height: 38,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          },
        }}>
        {avatar}
      </Box>
      <Box
        className="message-content-wrapper"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '80%',
          minWidth: 'auto',
          position: 'relative',
        }}>
        <Box className={cx('content')}>
          {/* Display image attachments for user messages */}
          {attachments && attachments.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: attachments.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 1,
                mb: text ? 1.5 : 0,
              }}>
              {attachments.map((attachment, index) => (
                <Box
                  key={attachment.url || index}
                  sx={{
                    position: 'relative',
                    width: '100%',
                    paddingTop: attachments.length === 1 ? '66.67%' : '100%', // 3:2 ratio for single image, square for grid
                    borderRadius: 2,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: isUser ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
                    '&:hover': {
                      borderColor: isUser ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.2)',
                    },
                  }}>
                  <img
                    src={attachment.url}
                    alt={attachment.name || `Image ${index + 1}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {text && (
            <Box component={ReactMarkdown} className={cx('message', loading && 'cursor')}>
              {text}
            </Box>
          )}

          {children}
        </Box>

        {/* Timestamp and actions outside the bubble - always show */}
        <Box
          className="message-meta"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 0.5,
            opacity: 0,
            transition: 'opacity 0.2s ease',
            justifyContent: isLeftRight && isUser ? 'flex-end' : 'flex-start',
          }}>
          {timestamp && (
            <Box
              className="timestamp"
              sx={{
                fontSize: '11px',
                color: 'text.secondary',
              }}>
              {formattedTime}
            </Box>
          )}
          <Box
            className="actions"
            sx={{
              display: 'flex',
              gap: 0.5,
              '& button': {
                minWidth: 0,
                p: 0.5,
                height: 24,
                width: 24,
                color: 'rgba(0, 0, 0, 0.5)',
                borderRadius: 0.5,
                transition: 'all 0.15s ease',
                bgcolor: 'rgba(0, 0, 0, 0.04)',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.1)',
                  color: 'rgba(0, 0, 0, 0.8)',
                },
              },
            }}>
            {actions}
            {text && <CopyButton key="copy" message={text} />}
          </Box>
        </Box>
      </Box>
    </Root>
  );
}

function CopyButton({ message }: { message: string }) {
  const [copied, setCopied] = useState<'copied' | boolean>(false);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Tooltip title={copied === 'copied' ? 'Copied!' : 'Copy'} placement="top" open={showTooltip || Boolean(copied)}>
      <Button
        size="small"
        className={cx('copy', copied && 'active')}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => {
          navigator.clipboard.writeText(message);
          setCopied('copied');
          setShowTooltip(false);
          setTimeout(() => setCopied(false), 2000);
        }}
        sx={{
          color: copied === 'copied' ? 'success.main' : 'inherit',
          transition: 'color 0.2s ease',
        }}>
        {copied === 'copied' ? <CheckCircleOutline fontSize="small" /> : <CopyAll fontSize="small" />}
      </Button>
    </Tooltip>
  );
}
const Root = styled(Box)`
  > .message-content-wrapper {
    > .content {
      min-height: 40px;
      overflow: hidden;
      word-break: break-word;
      padding: 14px 18px;
      border-radius: 12px;
      position: relative;
      background-color: transparent;
      border: none;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;

      > .message {
        line-height: 1.6;
        font-size: 15px;

        > *:first-of-type {
          margin-top: 0;
        }
        > *:last-child {
          margin-bottom: 0;
        }

        p {
          margin: 0.8em 0;
        }

        pre {
          line-height: 1.5;
          background-color: #f6f8fa;
          overflow: auto;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          margin: 12px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          position: relative;

          &::before {
            content: attr(data-language);
            position: absolute;
            top: 8px;
            right: 8px;
            font-size: 11px;
            color: rgba(0, 0, 0, 0.4);
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
        }

        code {
          background-color: rgba(175, 184, 193, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.9em;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
        }

        pre code {
          background-color: transparent;
          padding: 0;
          display: block;
          border: none !important;
        }

        ul,
        ol {
          padding-left: 24px;
        }

        li {
          margin: 4px 0;
        }

        blockquote {
          border-left: 3px solid rgba(0, 0, 0, 0.1);
          padding-left: 16px;
          margin: 12px 0;
          color: rgba(0, 0, 0, 0.7);
        }

        table {
          border-collapse: collapse;
          width: 100%;
          margin: 12px 0;
        }

        th,
        td {
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 8px 12px;
          text-align: left;
        }

        th {
          background-color: rgba(0, 0, 0, 0.02);
          font-weight: 600;
        }

        &.cursor {
          > *:last-child {
            &:after {
              content: '';
              display: inline-block;
              vertical-align: middle;
              height: 1em;
              margin-top: -0.15em;
              margin-left: 0.15em;
              border-right: 0.15em solid #1976d2;
              animation: blink-caret 0.75s step-end infinite;

              @keyframes blink-caret {
                from,
                to {
                  border-color: transparent;
                }
                50% {
                  border-color: #1976d2;
                }
              }
            }
          }
        }
      }
    }
  }

  /* User message style (right-aligned with blue background) */
  &.user-message {
    > .message-content-wrapper > .content {
      background: #64b5f6;
      color: white;
      border: none;
      border-radius: 20px;
      box-shadow:
        0 2px 8px rgba(100, 181, 246, 0.2),
        0 1px 3px rgba(100, 181, 246, 0.12);
      position: relative;
      overflow: visible;

      .message {
        color: white;

        code {
          background-color: rgba(255, 255, 255, 0.25);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        pre {
          background-color: rgba(0, 0, 0, 0.25);
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);

          code {
            color: rgba(255, 255, 255, 0.95);
            border: none !important;
            background-color: transparent !important;
            padding: 0 !important;
          }
        }

        a {
          color: #90caf9;
          text-decoration: underline;
          text-decoration-color: rgba(255, 255, 255, 0.4);

          &:hover {
            color: #bbdefb;
          }
        }

        strong {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.98);
        }
      }
    }

    &:hover > .message-content-wrapper > .content {
      background: #42a5f5;
    }
  }

  /* AI message style (left-aligned with light background) */
  &.ai-message {
    > .message-content-wrapper > .content {
      background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 20px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.04),
        0 1px 2px rgba(0, 0, 0, 0.06);

      .message {
        color: rgba(0, 0, 0, 0.87);

        code {
          background: linear-gradient(to bottom, #f5f5f5, #eeeeee);
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        pre {
          background: linear-gradient(to bottom, #f8f9fa, #f1f3f4);
          border: 1px solid rgba(0, 0, 0, 0.08);

          code {
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
          }
        }

        a {
          color: #1976d2;
          text-decoration: none;
          border-bottom: 1px solid rgba(25, 118, 210, 0.3);
          transition: all 0.2s ease;

          &:hover {
            color: #1565c0;
            border-bottom-color: #1565c0;
          }
        }

        strong {
          font-weight: 600;
          color: rgba(0, 0, 0, 0.95);
        }
      }
    }

    &:hover > .message-content-wrapper > .content {
      background: linear-gradient(to bottom, #fafafa 0%, #f5f5f5 100%);
      border-color: rgba(0, 0, 0, 0.12);
    }
  }

  /* Traditional mode (non left-right) also shows meta on hover */
  &:not(.user-message):not(.ai-message) {
    > .message-content-wrapper > .content {
      background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 20px;
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.04),
        0 1px 2px rgba(0, 0, 0, 0.06);

      .message {
        color: rgba(0, 0, 0, 0.87);

        code {
          background: linear-gradient(to bottom, #f5f5f5, #eeeeee);
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        pre {
          background: linear-gradient(to bottom, #f8f9fa, #f1f3f4);
          border: 1px solid rgba(0, 0, 0, 0.08);

          code {
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
          }
        }
      }
    }

    &:hover > .message-content-wrapper > .content {
      background: linear-gradient(to bottom, #fafafa 0%, #f5f5f5 100%);
      border-color: rgba(0, 0, 0, 0.12);
    }
  }
`;
