import { getPrefix } from '@app/libs/util';
import { AI_PROVIDER_DISPLAY_NAMES } from '@blocklet/aigne-hub/api';
import {
  Conversation,
  ConversationRef,
  CreditButton,
  MessageItem,
  useConversation,
} from '@blocklet/aigne-hub/components';
import { HighlightOff } from '@mui/icons-material';
import { Avatar, Button, MenuItem, Select, Tooltip } from '@mui/material';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { joinURL } from 'ufo';

import { useSessionContext } from '../../contexts/session';
import { ImageGenerationSize, imageGenerationsV2, textCompletionsV2 } from '../../libs/ai';

interface ModelOption {
  value: string;
  label: string;
}

interface ModelGroup {
  provider: string;
  displayName: string;
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
const providerDisplayNames = AI_PROVIDER_DISPLAY_NAMES;

// Format API data to frontend needed format
function formatModelsData(apiModels: ApiModel[]): ModelGroup[] {
  const providerMap = new Map<string, ModelOption[]>();

  apiModels.forEach((apiModel) => {
    apiModel.providers.forEach((provider) => {
      const providerName = provider.name;
      if (!providerMap.has(providerName)) {
        providerMap.set(providerName, []);
      }

      const modelValue = `${providerName}/${apiModel.model}`;
      const modelLabel = apiModel.model;

      // Avoid adding duplicate models
      const existingModels = providerMap.get(providerName)!;
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
      displayName: providerDisplayNames[provider] || provider,
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
        const response = await api.get('/api/ai-providers/chat/models?type=chatCompletion');

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
    <Conversation
      ref={ref}
      sx={{
        maxWidth: 1000,
        mx: 'auto',
        width: '100%',
        height: '100%',
        overflow: 'initial',
        '.conversation-container': {
          m: 0,
        },
      }}
      messages={messages}
      onSubmit={(prompt) => add(prompt)}
      customActions={customActions}
      promptProps={{
        startAdornment: (
          <Select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            size="small"
            sx={{ alignSelf: 'stretch', minWidth: 280 }}
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
                  sx={{
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'text.secondary',
                    gap: 1,
                    '&.Mui-disabled': {
                      opacity: 1,
                    },
                  }}>
                  <Avatar
                    src={joinURL(getPrefix(), `/logo/${group.provider}.png`)}
                    sx={{ width: 24, height: 24 }}
                    alt={group.provider}
                  />
                  {group.displayName}
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
  );
}
