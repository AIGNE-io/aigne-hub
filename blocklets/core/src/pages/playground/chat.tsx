import { AI_PROVIDER_DISPLAY_NAMES } from '@blocklet/aigne-hub/api';
import type { ModelCapabilities } from '@blocklet/aigne-hub/api/types';
import {
  Conversation,
  ConversationRef,
  CreditButton,
  MessageItem,
  useConversation,
} from '@blocklet/aigne-hub/components';
import { ArrowDropDown, DeleteOutline, HighlightOff } from '@mui/icons-material';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ModelSelector, { ModelGroup, ModelOption } from '../../components/model-selector';
import { useSessionContext } from '../../contexts/session';
import { ImageGenerationSize, imageGenerationsV2, textCompletionsV2 } from '../../libs/ai';

interface ApiModel {
  model: string;
  description?: string;
  providers: Array<{
    id: string;
    name: string;
    displayName: string;
  }>;
  capabilities?: ModelCapabilities;
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
          description: apiModel.description,
          capabilities: apiModel.capabilities,
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

const STORAGE_KEY = 'aigne-hub-selected-model';

export default function Chat() {
  const { api } = useSessionContext();
  const ref = useRef<ConversationRef>(null);
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [model, setModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [modelsDataMap, setModelsDataMap] = useState<Map<string, ApiModel>>(new Map());
  const [selectorOpen, setSelectorOpen] = useState(false);

  // Fetch models data
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/ai-providers/chat/models?type=chatCompletion');

        const apiModels: ApiModel[] = response.data || [];

        // Build a map of model name to model data (including capabilities)
        const dataMap = new Map<string, ApiModel>();
        apiModels.forEach((apiModel) => {
          dataMap.set(apiModel.model, apiModel);
        });
        setModelsDataMap(dataMap);

        const formattedGroups = formatModelsData(apiModels);
        setModelGroups(formattedGroups);

        // Try to restore previously selected model from localStorage
        const savedModel = localStorage.getItem(STORAGE_KEY);
        const allModels = formattedGroups.flatMap((g) => g.models);
        const isValidSavedModel = savedModel && allModels.some((m) => m.value === savedModel);

        if (isValidSavedModel) {
          setModel(savedModel);
        } else if (formattedGroups.length > 0 && formattedGroups[0]!.models && formattedGroups[0]!.models!.length > 0) {
          // Set default selected model if no valid saved model
          const defaultModel = formattedGroups[0]?.models[0]?.value || '';
          setModel(defaultModel);
          if (defaultModel) {
            localStorage.setItem(STORAGE_KEY, defaultModel);
          }
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
        setModelGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [api]);

  // Update model capabilities when model changes
  useEffect(() => {
    if (!model || modelsDataMap.size === 0) {
      setModelCapabilities(null);
      return;
    }

    // Extract model name from "provider/model" format
    const modelName = model.includes('/') ? model.split('/').pop() : model;

    if (modelName) {
      const modelData = modelsDataMap.get(modelName);
      if (modelData?.capabilities) {
        setModelCapabilities(modelData.capabilities);
        // eslint-disable-next-line no-console
        console.log(`Model ${modelName} capabilities:`, modelData.capabilities);
      } else {
        setModelCapabilities(null);
      }
    }
  }, [model, modelsDataMap]);

  // Save selected model to localStorage when it changes
  const handleModelChange = useCallback((newModel: string) => {
    setModel(newModel);
    localStorage.setItem(STORAGE_KEY, newModel);
    // Don't auto-close - let ModelSelector handle it
  }, []);

  // Get display name for selected model
  const selectedModelDisplay = useMemo(() => {
    if (!model) return 'Select Model';
    const allModels = modelGroups.flatMap((g) => g.models);
    const selectedModel = allModels.find((m) => m.value === model);
    return selectedModel?.label || model.split('/').pop() || 'Select Model';
  }, [model, modelGroups]);

  const { messages, add, cancel, clearHistory } = useConversation({
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
    enableCache: true, // Enable conversation history caching
  });

  const handleClearHistory = useCallback(() => {
    // eslint-disable-next-line no-alert
    if (window.confirm('Are you sure you want to clear all conversation history?')) {
      clearHistory();
    }
  }, [clearHistory]);

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
      onSubmit={(prompt, attachments) => add(prompt, attachments)}
      customActions={customActions}
      promptProps={{
        modelCapabilities,
        startAdornment: (
          <>
            <Button
              onClick={() => setSelectorOpen(true)}
              disabled={loading || modelGroups.length === 0}
              endIcon={<ArrowDropDown />}
              sx={{
                minWidth: 200,
                justifyContent: 'space-between',
                py: 1,
                px: 1.5,
                borderRadius: 2,
                bgcolor: 'action.hover',
                color: 'text.primary',
                textTransform: 'none',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
                border: 'none',
                '&:hover': {
                  bgcolor: 'action.selected',
                  border: 'none',
                },
                '&.Mui-disabled': {
                  bgcolor: 'action.disabledBackground',
                  color: 'text.disabled',
                },
              }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  overflow: 'hidden',
                }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                  {loading ? 'Loading...' : selectedModelDisplay}
                </Typography>
              </Box>
            </Button>

            <Tooltip title="Clear conversation history" placement="top">
              <IconButton
                onClick={handleClearHistory}
                size="small"
                disabled={messages.length <= 1}
                sx={{
                  ml: 0.5,
                  color: 'text.secondary',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    color: 'error.main',
                    bgcolor: 'error.light',
                    transform: 'scale(1.1)',
                  },
                  '&.Mui-disabled': {
                    color: 'action.disabled',
                  },
                }}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>

            <ModelSelector
              open={selectorOpen}
              onClose={() => setSelectorOpen(false)}
              modelGroups={modelGroups}
              selectedModel={model}
              onModelSelect={handleModelChange}
            />
          </>
        ),
      }}
    />
  );
}
