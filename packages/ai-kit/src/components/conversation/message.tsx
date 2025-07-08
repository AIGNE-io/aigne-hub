import { cx } from '@emotion/css';
import styled from '@emotion/styled';
import { CopyAll } from '@mui/icons-material';
import { Box, BoxProps, Button, Tooltip } from '@mui/material';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import { ReactNode, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function Message({
  avatar = undefined,
  message = undefined,
  children = undefined,
  loading = false,
  actions = undefined,
  ...props
}: {
  avatar?: ReactNode;
  message?: string | ChatCompletionMessageParam[];
  children?: ReactNode;
  loading?: boolean;
  actions?: ReactNode[];
} & BoxProps) {
  const text = useMemo(
    () => (typeof message === 'string' ? message : message?.map((i) => `${i.role}: ${i.content}`).join('\n\n')),
    [message]
  );

  return (
    <Root {...props} display="flex">
      <Box
        className="avatar"
        sx={{
          mr: 1,
        }}>
        {avatar}
      </Box>
      <Box className={cx('content')}>
        <Box component={ReactMarkdown} className={cx('message', loading && 'cursor')}>
          {text}
        </Box>

        {children}

        <Box className="actions">
          {actions}
          {text && <CopyButton key="copy" message={text} />}
        </Box>
      </Box>
    </Root>
  );
}

function CopyButton({ message }: { message: string }) {
  const [copied, setCopied] = useState<'copied' | boolean>(false);

  return (
    <Tooltip title={copied === 'copied' ? 'Copied!' : 'Copy'} placement="top" open={Boolean(copied)}>
      <Button
        size="small"
        className={cx('copy', copied && 'active')}
        onMouseEnter={() => setCopied(true)}
        onMouseLeave={() => setCopied(false)}
        onClick={() => {
          navigator.clipboard.writeText(message);
          setCopied('copied');
          setTimeout(() => setCopied(false), 1500);
        }}>
        <CopyAll fontSize="small" />
      </Button>
    </Tooltip>
  );
}

const Root = styled(Box)`
  > .avatar {
    padding-top: 5px;

    > .MuiAvatar-root {
      width: 30px;
      height: 30px;
    }
  }

  > .content {
    min-height: 40px;
    flex: 1;
    overflow: hidden;
    word-break: break-word;
    padding: 8px;
    border-radius: 4px;
    position: relative;

    > .message {
      > *:first-of-type {
        margin-top: 0;
      }
      > *:last-child {
        margin-bottom: 0;
      }

      pre {
        line-height: 1.2;
        background-color: #f6f8fa;
        overflow: auto;
        padding: 16px;
        border-radius: 3px;
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
      }
    }

    > .actions {
      position: absolute;
      right: 2px;
      top: 2px;
      border-radius: 4px;
      opacity: 0;

      &.active {
        display: flex;
      }

      button {
        min-width: 0;
        padding: 0;
        height: 24px;
        width: 22px;
        color: rgba(0, 0, 0, 0.4);
      }
    }
  }

  &:hover {
    > .content {
      background-color: rgba(0, 0, 0, 0.05);

      > .actions {
        opacity: 1;
        background-color: rgba(240, 240, 240, 0.9);
      }
    }
  }
`;
