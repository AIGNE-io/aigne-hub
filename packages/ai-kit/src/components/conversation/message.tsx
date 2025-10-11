import { cx } from '@emotion/css';
import { CheckCircleOutline, CopyAll } from '@mui/icons-material';
import { Box, BoxProps, Button, Tooltip, useTheme } from '@mui/material';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export interface MessageProps extends BoxProps {
  avatar?: ReactNode;
  message?: string | ChatCompletionMessageParam[];
  children?: ReactNode;
  loading?: boolean;
  actions?: ReactNode[];
  timestamp?: number;
  isUser?: boolean;
  chatLayout?: 'traditional' | 'left-right';
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
  ...props
}: MessageProps) {
  const theme = useTheme();
  const text = useMemo(
    () => (typeof message === 'string' ? message : message?.map((i) => `${i.role}: ${i.content}`).join('\n\n')),
    [message]
  );

  // Create theme-based styles
  const getMessageStyles = () => {
    const baseStyles = {
      '> .message-content-wrapper': {
        '> .content': {
          '> .message': {
            lineHeight: 1.6,
            fontSize: '15px',
            '> *:first-of-type': {
              marginTop: 0,
            },
            '> *:last-child': {
              marginBottom: 0,
            },
            pre: {
              lineHeight: 1.5,
              backgroundColor: theme.palette.grey[50],
              overflow: 'auto',
              padding: 2,
              borderRadius: 1,
              border: `1px solid ${theme.palette.divider}`,
              margin: '12px 0',
              boxShadow: theme.shadows[1],
              position: 'relative',
              '&::before': {
                content: 'attr(data-language)',
                position: 'absolute',
                top: 8,
                right: 8,
                fontSize: '11px',
                color: theme.palette.text.disabled,
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: '0.5px',
              },
            },
            code: {
              backgroundColor: theme.palette.action.hover,
              padding: '2px 6px',
              borderRadius: 0.5,
              fontSize: '0.9em',
              fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro", monospace',
            },
            'pre code': {
              backgroundColor: 'transparent',
              padding: 0,
              display: 'block',
              border: 'none !important',
            },
            'ul, ol': {
              paddingLeft: '24px',
            },
            li: {
              margin: '4px 0',
            },
            blockquote: {
              borderLeft: `3px solid ${theme.palette.divider}`,
              paddingLeft: 2,
              margin: '12px 0',
              color: theme.palette.text.secondary,
            },
            table: {
              borderCollapse: 'collapse',
              width: '100%',
              margin: '12px 0',
            },
            'th, td': {
              border: `1px solid ${theme.palette.divider}`,
              padding: '8px 12px',
              textAlign: 'left',
            },
            th: {
              backgroundColor: theme.palette.action.hover,
              fontWeight: 600,
            },
            '&.cursor': {
              '> *:last-child': {
                '&:after': {
                  content: '""',
                  display: 'inline-block',
                  verticalAlign: 'middle',
                  height: '1em',
                  marginTop: '-0.15em',
                  marginLeft: '0.15em',
                  borderRight: `0.15em solid ${theme.palette.primary.main}`,
                  animation: 'blink-caret 0.75s step-end infinite',
                  '@keyframes blink-caret': {
                    'from, to': {
                      borderColor: 'transparent',
                    },
                    '50%': {
                      borderColor: theme.palette.primary.main,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    // User message styles (right-aligned with blue background)
    if (chatLayout === 'left-right' && isUser) {
      return {
        ...baseStyles,
        '> .message-content-wrapper > .content': {
          background: theme.palette.primary.light,
          color: theme.palette.primary.contrastText,
          border: 'none',
          boxShadow: theme.shadows[2],
          position: 'relative',
          overflow: 'visible',
          '.message': {
            color: theme.palette.primary.contrastText,
            code: {
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              color: theme.palette.primary.contrastText,
              border: '1px solid rgba(255, 255, 255, 0.15)',
            },
            pre: {
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
              code: {
                color: 'rgba(255, 255, 255, 0.95)',
                border: 'none !important',
                backgroundColor: 'transparent !important',
                padding: '0 !important',
              },
            },
            a: {
              color: theme.palette.primary.light,
              textDecoration: 'underline',
              textDecorationColor: 'rgba(255, 255, 255, 0.4)',
              '&:hover': {
                color: '#bbdefb',
              },
            },
            strong: {
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.98)',
            },
          },
        },
        '&:hover > .message-content-wrapper > .content': {
          background: theme.palette.primary.main,
        },
      };
    }

    // AI message styles (left-aligned with light background)
    return {
      ...baseStyles,
      '> .message-content-wrapper > .content': {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: theme.shadows[1],
        '.message': {
          color: theme.palette.text.primary,
          code: {
            background: theme.palette.grey[100],
            border: `1px solid ${theme.palette.divider}`,
          },
          pre: {
            background: theme.palette.grey[50],
            border: `1px solid ${theme.palette.divider}`,
            code: {
              background: 'transparent !important',
              border: 'none !important',
              padding: '0 !important',
            },
          },
          a: {
            color: theme.palette.primary.main,
            textDecoration: 'none',
            borderBottom: `1px solid ${theme.palette.primary.light}`,
            transition: 'all 0.2s ease',
            '&:hover': {
              color: theme.palette.primary.dark,
              borderBottomColor: theme.palette.primary.dark,
            },
          },
          strong: {
            fontWeight: 600,
            color: theme.palette.text.primary,
          },
        },
      },
      '&:hover > .message-content-wrapper > .content': {
        background: theme.palette.grey[50],
        borderColor: theme.palette.action.focus,
      },
    };
  };

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
    <Box
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
            }
          : {}),
        ...getMessageStyles(),
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
        <Box
          className={cx('content')}
          sx={{
            minHeight: 40,
            overflow: 'hidden',
            wordBreak: 'break-word',
            padding: 1.75,
            borderRadius: 2,
            position: 'relative',
            backgroundColor: 'transparent',
            border: 'none',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
          }}>
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
                color: 'text.secondary',
                borderRadius: 0.5,
                transition: 'all 0.15s ease',
              },
            }}>
            {actions}
            {text && <CopyButton key="copy" message={text} />}
          </Box>
        </Box>
      </Box>
    </Box>
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
          navigator.clipboard
            .writeText(message)
            .then(() => {
              setCopied('copied');
            })
            .catch((err) => {
              console.error('Failed to copy message', err);
            });
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
