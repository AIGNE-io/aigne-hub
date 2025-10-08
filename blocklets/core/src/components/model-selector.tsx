import { getPrefix } from '@app/libs/util';
import type { ModelCapabilities } from '@blocklet/aigne-hub/api/types';
import { Close, Search } from '@mui/icons-material';
import {
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { joinURL } from 'ufo';

export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  capabilities?: ModelCapabilities;
}

export interface ModelGroup {
  provider: string;
  displayName: string;
  models: ModelOption[];
}

interface ModelSelectorProps {
  open: boolean;
  onClose: () => void;
  modelGroups: ModelGroup[];
  selectedModel: string;
  onModelSelect: (modelValue: string) => void;
}

// Helper function to generate capability badges
function CapabilityChips({ capabilities = undefined }: { capabilities?: ModelCapabilities }) {
  if (!capabilities) return null;

  const chips: Array<{ label: string; color: string }> = [];

  if (capabilities.vision) {
    chips.push({ label: 'Vision', color: '#7c3aed' }); // Purple
  }
  if (capabilities.imageGeneration) {
    chips.push({ label: 'Image Gen', color: '#ec4899' }); // Pink
  }
  if (capabilities.audio) {
    chips.push({ label: 'Audio', color: '#f59e0b' }); // Amber
  }
  if (capabilities.search) {
    chips.push({ label: 'Search', color: '#3b82f6' }); // Blue
  }
  if (capabilities.realtime) {
    chips.push({ label: 'Realtime', color: '#10b981' }); // Green
  }

  if (chips.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {chips.map((chip) => (
        <Chip
          key={chip.label}
          label={chip.label}
          size="small"
          sx={{
            height: 20,
            fontSize: '11px',
            fontWeight: 600,
            bgcolor: chip.color,
            color: 'white',
            '& .MuiChip-label': {
              px: 1,
            },
          }}
        />
      ))}
    </Box>
  );
}

export default function ModelSelector({
  open,
  onClose,
  modelGroups,
  selectedModel,
  onModelSelect,
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'text' | 'vision' | 'image' | 'audio'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  // Get unique providers for filtering (with filtered counts based on category)
  const availableProviders = useMemo(() => {
    return modelGroups
      .map((group) => {
        // Apply category filter to count
        let filteredModels = group.models;

        if (categoryFilter !== 'all') {
          filteredModels = group.models.filter((model) => {
            const caps = model.capabilities;
            if (!caps) return categoryFilter === 'text';

            switch (categoryFilter) {
              case 'vision':
                return caps.vision;
              case 'image':
                return caps.imageGeneration;
              case 'audio':
                return caps.audio;
              case 'text':
                return caps.text && !caps.vision && !caps.imageGeneration && !caps.audio;
              default:
                return true;
            }
          });
        }

        return {
          value: group.provider,
          label: group.displayName,
          count: filteredModels.length,
        };
      })
      .filter((provider) => provider.count > 0); // Only show providers with models
  }, [modelGroups, categoryFilter]);

  // Reset provider filter if current provider has no models after category filter
  useEffect(() => {
    if (providerFilter !== 'all') {
      const currentProvider = availableProviders.find((p) => p.value === providerFilter);
      if (!currentProvider) {
        setProviderFilter('all');
      }
    }
  }, [availableProviders, providerFilter]);

  // Filter models based on search, category, and provider
  const filteredGroups = useMemo(() => {
    let filtered = modelGroups;

    // Apply provider filter
    if (providerFilter !== 'all') {
      filtered = filtered.filter((group) => group.provider === providerFilter);
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered
        .map((group) => ({
          ...group,
          models: group.models.filter((model) => {
            const caps = model.capabilities;
            if (!caps) return categoryFilter === 'text';

            switch (categoryFilter) {
              case 'vision':
                return caps.vision;
              case 'image':
                return caps.imageGeneration;
              case 'audio':
                return caps.audio;
              case 'text':
                return caps.text && !caps.vision && !caps.imageGeneration && !caps.audio;
              default:
                return true;
            }
          }),
        }))
        .filter((group) => group.models.length > 0);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered
        .map((group) => ({
          ...group,
          models: group.models.filter(
            (model) => model.label.toLowerCase().includes(query) || group.displayName.toLowerCase().includes(query)
          ),
        }))
        .filter((group) => group.models.length > 0);
    }

    return filtered;
  }, [modelGroups, searchQuery, categoryFilter, providerFilter]);

  const handleModelClick = (modelValue: string) => {
    onModelSelect(modelValue);
    // Don't auto-close - let user browse and compare models
  };

  const categoryOptions = [
    { value: 'all', label: 'All Models', count: modelGroups.flatMap((g) => g.models).length },
    {
      value: 'text',
      label: 'Text Only',
      count: modelGroups
        .flatMap((g) => g.models)
        .filter((m) => m.capabilities?.text && !m.capabilities?.vision && !m.capabilities?.imageGeneration).length,
    },
    {
      value: 'vision',
      label: 'Vision',
      count: modelGroups.flatMap((g) => g.models).filter((m) => m.capabilities?.vision).length,
    },
    {
      value: 'image',
      label: 'Image Gen',
      count: modelGroups.flatMap((g) => g.models).filter((m) => m.capabilities?.imageGeneration).length,
    },
    {
      value: 'audio',
      label: 'Audio',
      count: modelGroups.flatMap((g) => g.models).filter((m) => m.capabilities?.audio).length,
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '80vh',
        },
      }}>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Select AI Model
        </Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Search Bar */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField
            fullWidth
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <Close fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </Box>

        {/* Category Filter Tabs */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            px: 2,
            py: 1.5,
            overflowX: 'auto',
            borderBottom: '1px solid',
            borderColor: 'divider',
            '&::-webkit-scrollbar': {
              height: 6,
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'divider',
              borderRadius: 3,
            },
          }}>
          {categoryOptions.map((option) => (
            <Chip
              key={option.value}
              label={`${option.label} (${option.count})`}
              onClick={() => setCategoryFilter(option.value as any)}
              variant={categoryFilter === option.value ? 'filled' : 'outlined'}
              sx={{
                fontWeight: categoryFilter === option.value ? 600 : 400,
                bgcolor: categoryFilter === option.value ? 'primary.main' : 'transparent',
                color: categoryFilter === option.value ? 'primary.contrastText' : 'text.primary',
                borderColor: categoryFilter === option.value ? 'primary.main' : 'divider',
                '&:hover': {
                  bgcolor: categoryFilter === option.value ? 'primary.dark' : 'action.hover',
                },
              }}
            />
          ))}
        </Box>

        {/* Provider Filter Tabs */}
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            px: 2,
            py: 1,
            overflowX: 'auto',
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.default',
            '&::-webkit-scrollbar': {
              height: 6,
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'divider',
              borderRadius: 3,
            },
          }}>
          <Chip
            label="All"
            onClick={() => setProviderFilter('all')}
            variant={providerFilter === 'all' ? 'filled' : 'outlined'}
            size="small"
            sx={{
              height: 24,
              fontSize: '12px',
              fontWeight: providerFilter === 'all' ? 600 : 400,
              bgcolor: providerFilter === 'all' ? 'action.selected' : 'transparent',
              color: 'text.primary',
              borderColor: providerFilter === 'all' ? 'action.selected' : 'divider',
              '&:hover': {
                bgcolor: providerFilter === 'all' ? 'action.selected' : 'action.hover',
              },
            }}
          />
          {availableProviders.map((provider) => (
            <Chip
              key={provider.value}
              label={`${provider.label} (${provider.count})`}
              onClick={() => setProviderFilter(provider.value)}
              variant={providerFilter === provider.value ? 'filled' : 'outlined'}
              size="small"
              sx={{
                height: 24,
                fontSize: '12px',
                fontWeight: providerFilter === provider.value ? 600 : 400,
                bgcolor: providerFilter === provider.value ? 'action.selected' : 'transparent',
                color: 'text.primary',
                borderColor: providerFilter === provider.value ? 'action.selected' : 'divider',
                '&:hover': {
                  bgcolor: providerFilter === provider.value ? 'action.selected' : 'action.hover',
                },
              }}
            />
          ))}
        </Box>

        {/* Models List */}
        <List
          sx={{
            maxHeight: 'calc(80vh - 280px)',
            overflow: 'auto',
            py: 0,
          }}>
          {filteredGroups.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 8,
                color: 'text.secondary',
              }}>
              <Typography variant="body1" sx={{ mb: 1 }}>
                No models found
              </Typography>
              <Typography variant="body2">Try adjusting your search or filter</Typography>
            </Box>
          ) : (
            filteredGroups.map((group) => (
              <Box key={group.provider}>
                <ListSubheader
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 1.5,
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}>
                  <Avatar
                    src={joinURL(getPrefix(), `/logo/${group.provider}.png`)}
                    sx={{ width: 24, height: 24 }}
                    alt={group.provider}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {group.displayName}
                  </Typography>
                  <Chip
                    label={group.models.length}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '11px',
                      bgcolor: 'action.selected',
                    }}
                  />
                </ListSubheader>

                {group.models.map((model) => (
                  <ListItemButton
                    key={model.value}
                    selected={selectedModel === model.value}
                    onClick={() => handleModelClick(model.value)}
                    sx={{
                      py: 1.5,
                      px: 3,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&.Mui-selected': {
                        bgcolor: 'primary.lighter',
                        borderLeft: '3px solid',
                        borderLeftColor: 'primary.main',
                        '&:hover': {
                          bgcolor: 'primary.lighter',
                        },
                      },
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {model.label}
                          </Typography>
                          {selectedModel === model.value && (
                            <Chip
                              label="Selected"
                              size="small"
                              color="primary"
                              sx={{
                                height: 20,
                                fontSize: '10px',
                                fontWeight: 600,
                              }}
                            />
                          )}
                          <CapabilityChips capabilities={model.capabilities} />
                        </Box>
                      }
                    />
                  </ListItemButton>
                ))}
              </Box>
            ))
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}
