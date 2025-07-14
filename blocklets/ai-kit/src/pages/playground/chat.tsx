import {
  Conversation,
  ConversationRef,
  MessageItem,
  SubscribeButton,
  useConversation,
} from '@blocklet/ai-kit/components';
import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import styled from '@emotion/styled';
import { HighlightOff } from '@mui/icons-material';
import { Box, Button, MenuItem, Select, Tooltip } from '@mui/material';
import { ReactNode, useCallback, useRef, useState } from 'react';

import { ImageGenerationSize, imageGenerations, textCompletions } from '../../libs/ai';

const modelGroups = [
  {
    provider: 'OpenAI',
    models: [
      { value: 'openai/o4-mini', label: 'o4-mini' },
      { value: 'openai/o3-mini', label: 'o3-mini' },
      { value: 'openai/o3', label: 'o3' },
      { value: 'openai/gpt-4o', label: 'GPT-4o' },
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
      { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'openai/gpt-4', label: 'GPT-4' },
      { value: 'openai/gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
  },
  {
    provider: 'OpenRouter',
    models: [
      { value: 'openrouter/anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'openrouter/anthropic/claude-3-opus', label: 'Claude 3 Opus' },
      { value: 'openrouter/anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
      { value: 'openrouter/openai/gpt-4o', label: 'GPT-4o' },
      { value: 'openrouter/openai/gpt-4.1', label: 'GPT-4.1' },
      { value: 'openrouter/openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'openrouter/meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
      { value: 'openrouter/mistralai/mistral-7b-instruct', label: 'Mistral 7B Instruct' },
    ],
  },
  {
    provider: 'Anthropic',
    models: [
      { value: 'anthropic/claude-opus-4-20250514', label: 'Claude Opus 4' },
      { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'anthropic/claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
      { value: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'anthropic/claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ],
  },
  {
    provider: 'Amazon Bedrock',
    models: [
      { value: 'bedrock/anthropic.claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'bedrock/anthropic.claude-3-opus', label: 'Claude 3 Opus' },
      { value: 'bedrock/anthropic.claude-3-haiku', label: 'Claude 3 Haiku' },
      { value: 'bedrock/amazon.titan-text-premier-v1:0', label: 'Titan Text Premier v1' },
      { value: 'bedrock/amazon.titan-text-express-v1', label: 'Titan Text Express v1' },
      { value: 'bedrock/meta.llama3-70b-instruct-v1:0', label: 'Llama 3 70B Instruct' },
      { value: 'bedrock/mistral.mistral-7b-instruct-v0:2', label: 'Mistral 7B Instruct' },
    ],
  },
  {
    provider: 'DeepSeek',
    models: [{ value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' }],
  },
  {
    provider: 'Google',
    models: [
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'google/gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash-Lite' },
      { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'google/gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
      { value: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'google/gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  {
    provider: 'Ollama',
    models: [
      { value: 'ollama/llama3.1:70b', label: 'LLaMA 3.1 70B' },
      { value: 'ollama/llama3.1:8b', label: 'LLaMA 3.1 8B' },
      { value: 'ollama/llama3.2:3b', label: 'LLaMA 3.2 3B' },
      { value: 'ollama/llama3.2:1b', label: 'LLaMA 3.2 1B' },
      { value: 'ollama/mistral:7b', label: 'Mistral 7B' },
      { value: 'ollama/codellama:13b', label: 'Code Llama 13B' },
      { value: 'ollama/codellama:7b', label: 'Code Llama 7B' },
    ],
  },
  {
    provider: 'xAI',
    models: [
      { value: 'xai/grok-4', label: 'Grok 4' },
      { value: 'xai/grok-3', label: 'Grok 3' },
      { value: 'xai/grok-3-mini', label: 'Grok 3 Mini' },
      { value: 'xai/grok-2', label: 'Grok 2' },
    ],
  },
];

export default function Chat() {
  const ref = useRef<ConversationRef>(null);
  const [model, setModel] = useState(modelGroups[0]?.models[0]?.value);

  const { messages, add, cancel } = useConversation({
    scrollToBottom: (o) => ref.current?.scrollToBottom(o),
    textCompletions: (prompt) =>
      textCompletions({
        ...(typeof prompt === 'string' ? { prompt } : { messages: prompt }),
        stream: true,
        model,
      }),
    imageGenerations: (prompt) =>
      imageGenerations({ ...prompt, size: prompt.size as ImageGenerationSize, response_format: 'b64_json' }).then(
        (res) => res.data.map((i) => ({ url: `data:image/png;base64,${i.b64_json}` }))
      ),
  });

  const customActions = useCallback(
    (msg: MessageItem): Array<ReactNode[]> => {
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
        [<SubscribeButton shouldOpenInNewTab showUseAIServiceButton key="subscribe" />],
      ];
    },
    [cancel]
  );

  return (
    <Root>
      <Dashboard
        footerProps={{ className: 'dashboard-footer' }}
        // @ts-ignore
        headerAddons={(exists: ReactNode[]) => [<SubscribeButton />, ...exists]}
        // FIXME: remove following undefined props after issue https://github.com/ArcBlock/ux/issues/1136 solved
        meta={undefined}
        fallbackUrl={undefined}
        invalidPathFallback={undefined}
        sessionManagerProps={undefined}
        links={undefined}
        showDomainWarningDialog={undefined}>
        <Conversation
          ref={ref}
          sx={{ maxWidth: 800, mx: 'auto', width: '100%', height: '100%' }}
          messages={messages}
          onSubmit={(prompt) => add(prompt)}
          customActions={customActions}
          promptProps={{
            startAdornment: (
              <Select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                size="small"
                sx={{ alignSelf: 'stretch', minWidth: 200 }}
                displayEmpty
                renderValue={(selected) => {
                  const selectedModel = modelGroups.flatMap((g) => g.models).find((m) => m.value === selected);
                  return selectedModel?.label || 'Select Model';
                }}
                MenuProps={{
                  PaperProps: { sx: { maxHeight: 400 } },
                }}>
                {modelGroups.map((group) => [
                  <MenuItem
                    key={`header-${group.provider}`}
                    disabled
                    sx={{ fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>
                    {group.provider}
                  </MenuItem>,
                  ...group.models.map((model) => (
                    <MenuItem key={model.value} value={model.value} sx={{ ml: 1 }}>
                      {model.label}
                    </MenuItem>
                  )),
                ])}
              </Select>
            ),
          }}
        />
      </Dashboard>
    </Root>
  );
}

const Root = styled(Box)`
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
      padding: 8px 0;

      .logo-container {
        svg {
          height: 100%;
        }
      }
    }
  }
`;
