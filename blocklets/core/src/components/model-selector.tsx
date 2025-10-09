import { getPrefix } from '@app/libs/util';
import type { ModelGroup } from '@blocklet/aigne-hub/api/types';
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
import { useMemo, useState } from 'react';
import { joinURL } from 'ufo';

import { ReactComponent as EmbeddingIcon } from '../icons/icon-embedding.svg';
import { ReactComponent as ImageIcon } from '../icons/icon-image.svg';
import { ReactComponent as ChatIcon } from '../icons/icon-text.svg';

interface ModelSelectorProps {
  open: boolean;
  onClose: () => void;
  modelGroups: ModelGroup[];
  selectedModel: string;
  onModelSelect: (modelValue: string) => void;
}

export default function ModelSelector({
  open,
  onClose,
  modelGroups,
  selectedModel,
  onModelSelect,
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Get unique providers for filtering (based on current type filter)
  const availableProviders = useMemo(() => {
    let filtered = modelGroups;

    // Apply type filter to get accurate provider counts
    if (typeFilter !== 'all') {
      filtered = filtered
        .map((group) => ({
          ...group,
          models: group.models.filter((model) => model.type === typeFilter),
        }))
        .filter((group) => group.models.length > 0);
    }

    return filtered.map((group) => ({
      value: group.provider,
      label: group.displayName,
      count: group.models.length,
    }));
  }, [modelGroups, typeFilter]);

  // Filter models based on search, provider, and type
  const filteredGroups = useMemo(() => {
    let filtered = modelGroups;

    // Apply provider filter
    if (providerFilter !== 'all') {
      filtered = filtered.filter((group) => group.provider === providerFilter);
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered
        .map((group) => ({
          ...group,
          models: group.models.filter((model) => model.type === typeFilter),
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
  }, [modelGroups, searchQuery, providerFilter, typeFilter]);

  const handleModelClick = (modelValue: string) => {
    onModelSelect(modelValue);
    // Don't auto-close - let user browse and compare models
  };

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

        {/* Type Filter Tabs */}
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
          {[
            { key: 'all', label: 'All Models', icon: null },
            { key: 'chatCompletion', label: 'Chat', icon: <ChatIcon viewBox="0 0 12 12" /> },
            { key: 'imageGeneration', label: 'Image Gen', icon: <ImageIcon viewBox="0 0 12 12" /> },
            { key: 'embedding', label: 'Embedding', icon: <EmbeddingIcon viewBox="0 0 12 12" /> },
          ].map((option) => (
            <Chip
              key={option.key}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  {option.icon && (
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        svg: { width: '100%', height: '100%' },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {option.icon}
                    </Box>
                  )}
                  <Typography variant="caption" sx={{ fontSize: '12px', lineHeight: 1 }}>
                    {option.label}
                  </Typography>
                </Box>
              }
              onClick={() => setTypeFilter(option.key)}
              variant={typeFilter === option.key ? 'filled' : 'outlined'}
              sx={{
                fontWeight: typeFilter === option.key ? 600 : 400,
                bgcolor: typeFilter === option.key ? 'primary.main' : 'transparent',
                color: typeFilter === option.key ? 'primary.contrastText' : 'text.primary',
                borderColor: typeFilter === option.key ? 'primary.main' : 'divider',
                '&:hover': {
                  bgcolor: typeFilter === option.key ? 'primary.dark' : 'action.hover',
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
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <Avatar
                    src={joinURL(getPrefix(), `/logo/${provider.value}.png`)}
                    sx={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    alt={provider.label}
                  />
                  <Typography variant="caption" sx={{ fontSize: '12px', lineHeight: 1 }}>
                    {provider.label} ({provider.count})
                  </Typography>
                </Box>
              }
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
                          {model.type && (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                px: 1,
                                py: 0.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                bgcolor: 'background.paper',
                              }}>
                              <Box
                                sx={{
                                  width: 12,
                                  height: 12,
                                  svg: { width: '100%', height: '100%' },
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                {model.type === 'chatCompletion' && <ChatIcon viewBox="0 0 12 12" />}
                                {model.type === 'imageGeneration' && <ImageIcon viewBox="0 0 12 12" />}
                                {model.type === 'embedding' && <EmbeddingIcon viewBox="0 0 12 12" />}
                              </Box>
                              <Typography
                                variant="caption"
                                sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1 }}>
                                {model.type === 'chatCompletion'
                                  ? 'Chat'
                                  : model.type === 'imageGeneration'
                                    ? 'Image'
                                    : 'Embedding'}
                              </Typography>
                            </Box>
                          )}
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
