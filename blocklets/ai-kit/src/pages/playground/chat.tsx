import { Conversation, ConversationRef, CreditButton, MessageItem, useConversation } from '@blocklet/ai-kit/components';
import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import styled from '@emotion/styled';
import { HighlightOff } from '@mui/icons-material';
import { Box, Button, MenuItem, Select, Tooltip } from '@mui/material';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { useSessionContext } from '../../contexts/session';
import { ImageGenerationSize, imageGenerationsV2, textCompletionsV2 } from '../../libs/ai';

interface ModelOption {
  value: string;
  label: string;
}

interface ModelGroup {
  provider: string;
  models: ModelOption[];
}

interface ApiModel {
  model: string;
  description?: string;
  providers: Array<{
    id: string;
    name: string;
    displayName: string;
  }>;
}

// Provider name mapping
const providerDisplayNames: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  bedrock: 'Amazon Bedrock',
  deepseek: 'DeepSeek',
  google: 'Google',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  xai: 'xAI',
};

// Format API data to frontend needed format
function formatModelsData(apiModels: ApiModel[]): ModelGroup[] {
  const providerMap = new Map<string, ModelOption[]>();

  apiModels.forEach((apiModel) => {
    apiModel.providers.forEach((provider) => {
      const providerName = provider.name;
      const displayName = providerDisplayNames[providerName.toLowerCase()] || provider.displayName;

      if (!providerMap.has(displayName)) {
        providerMap.set(displayName, []);
      }

      const modelValue = `${providerName}/${apiModel.model}`;
      const modelLabel = apiModel.model;

      // Avoid adding duplicate models
      const existingModels = providerMap.get(displayName)!;
      if (!existingModels.some((m) => m.value === modelValue)) {
        existingModels.push({
          value: modelValue,
          label: modelLabel,
        });
      }
    });
  });

  // Convert to ModelGroup array and sort
  const modelGroups: ModelGroup[] = [];
  providerMap.forEach((models, provider) => {
    modelGroups.push({
      provider,
      models: models.sort((a, b) => a.label.localeCompare(b.label)),
    });
  });

  // Sort by provider name
  return modelGroups.sort((a, b) => a.provider.localeCompare(b.provider));
}

export default function Chat() {
  const { api } = useSessionContext();
  const ref = useRef<ConversationRef>(null);
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [model, setModel] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // 获取模型数据
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/ai-providers/models?type=chatCompletion');
        const apiModels: ApiModel[] = response.data || [];

        const formattedGroups = formatModelsData(apiModels);
        setModelGroups(formattedGroups);

        // Set default selected model
        if (formattedGroups.length > 0 && formattedGroups[0]!.models && formattedGroups[0]!.models!.length > 0) {
          setModel(formattedGroups[0]?.models[0]?.value || '');
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
        // If fetching fails, you can set a default empty array or display error information
        setModelGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [api]);

  const { messages, add, cancel } = useConversation({
    scrollToBottom: (o) => ref.current?.scrollToBottom(o),
    textCompletions: (prompt) =>
      textCompletionsV2({
        ...(typeof prompt === 'string' ? { prompt } : { messages: prompt }),
        stream: true,
        model,
      }),
    imageGenerations: (prompt) =>
      imageGenerationsV2({ ...prompt, size: prompt.size as ImageGenerationSize, response_format: 'b64_json' }).then(
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
        [<CreditButton shouldOpenInNewTab key="buy" />],
      ];
    },
    [cancel]
  );

  return (
    <Root>
      <Dashboard
        footerProps={{ className: 'dashboard-footer' }}
        // @ts-ignore
        headerAddons={(exists: ReactNode[]) => [<CreditButton />, ...exists]}
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
                disabled={loading || modelGroups.length === 0}
                renderValue={(selected) => {
                  if (loading) return 'Loading...';
                  if (modelGroups.length === 0) return 'No models available';

                  const selectedModel = modelGroups.flatMap((g) => g.models).find((m) => m.value === selected);
                  return selectedModel?.label || 'Select Model';
                }}
                MenuProps={{
                  PaperProps: { sx: { maxHeight: 400 } },
                }}>
                {loading ? (
                  <MenuItem disabled>Loading models...</MenuItem>
                ) : modelGroups.length === 0 ? (
                  <MenuItem disabled>No models available</MenuItem>
                ) : (
                  modelGroups.map((group) => [
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
                  ])
                )}
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
