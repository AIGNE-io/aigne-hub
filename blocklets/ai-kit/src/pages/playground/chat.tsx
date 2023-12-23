import { Conversation, ConversationRef, MessageItem, useConversation } from '@blocklet/ai-kit/components';
import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import styled from '@emotion/styled';
import { HighlightOff } from '@mui/icons-material';
import { Button, Tooltip } from '@mui/material';
import { ReactNode, useCallback, useRef } from 'react';

import { ImageGenerationSize, imageGenerations, textCompletions } from '../../libs/ai';

export default function Chat() {
  const ref = useRef<ConversationRef>(null);

  const { messages, add, cancel } = useConversation({
    scrollToBottom: (o) => ref.current?.scrollToBottom(o),
    textCompletions: (prompt) =>
      textCompletions({
        ...(typeof prompt === 'string' ? { prompt } : { messages: prompt }),
        stream: true,
      }),
    imageGenerations: (prompt) =>
      imageGenerations({ ...prompt, size: prompt.size as ImageGenerationSize, response_format: 'b64_json' }).then(
        (res) => res.data.map((i) => ({ url: `data:image/png;base64,${i.b64_json}` }))
      ),
  });

  const customActions = useCallback(
    (msg: MessageItem): [ReactNode[], ReactNode[]] => {
      return [
        [],
        [
          msg.loading && (
            <Tooltip key="stop" title="Stop" placement="top">
              <Button size="small" onClick={() => cancel(msg)}>
                <HighlightOff fontSize="small" />
              </Button>
            </Tooltip>
          ),
        ],
      ];
    },
    [cancel]
  );

  return (
    <Root footerProps={{ className: 'dashboard-footer' }}>
      <Conversation
        ref={ref}
        sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}
        messages={messages}
        onSubmit={(prompt) => add(prompt)}
        customActions={customActions}
      />
    </Root>
  );
}

const Root = styled(Dashboard)`
  > .dashboard-body > .dashboard-main {
    > .dashboard-content {
      display: flex;
      flex-direction: column;
      padding-left: 0;
      padding-right: 0;
      overflow: hidden;
    }

    > .dashboard-footer {
      margin-top: 0;
      padding: 0;

      .logo-container {
        svg {
          height: 100%;
        }
      }
    }
  }
`;
