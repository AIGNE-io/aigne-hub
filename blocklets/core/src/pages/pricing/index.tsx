import { Status } from '@app/components/status';
/* eslint-disable react/no-unstable-nested-components */
import { getPrefix } from '@app/libs/util';
import { useSubscription } from '@app/libs/ws';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { Table } from '@blocklet/aigne-hub/components';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { formatError } from '@blocklet/error';
import Header from '@blocklet/ui-react/lib/Header';
import styled from '@emotion/styled';
import { Icon } from '@iconify/react';
import { AllInclusiveOutlined, ArrowDropDown, ArrowDropUp, Search as SearchIcon } from '@mui/icons-material';
import {
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRequest, useSetState } from 'ahooks';
import Decimal from 'decimal.js';
import { debounce } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import { joinURL } from 'ufo';

import { useSessionContext } from '../../contexts/session';

const ONE_MILLION = 1000000;

const getPrice = (price: number | Decimal, fixed?: number, isImage?: boolean) => {
  const priceDecimal = new Decimal(price).mul(new Decimal(isImage ? 1 : ONE_MILLION));
  return formatNumber(fixed ? priceDecimal.toFixed(fixed) : priceDecimal.toString());
};

interface ModelData {
  key: string;
  model: string;
  type: string;
  provider: string;
  input_credits_per_token: number;
  output_credits_per_token: number;
  active?: boolean;
  providerDisplayName?: string;
  modelMetadata?: {
    maxTokens?: number;
    features?: string[];
    imageGeneration?: {
      max?: number;
      quality?: string[];
      size?: string[];
      style?: string[];
    };
  };
  status?: {
    available?: boolean;
    error?: {
      code?: string;
      message?: string;
    };
  };
  loading?: boolean;
}

const SearchRow = styled(Box)`
  display: flex;
  gap: 16px;
  align-items: center;
  flex-direction: column;

  ${({ theme }) => (theme as any).breakpoints.up('lg')} {
    flex-direction: row;
  }
`;

const TYPE_MAPPING: Record<string, string> = {
  chat: 'chatCompletion',
  image_generation: 'imageGeneration',
  embedding: 'embedding',
  audio_transcription: 'audioTranscription',
};
const listKey = 'pricing-models';
export default function PricingPage() {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();

  const [search, setSearch] = useSetState({
    pageSize: 25,
    page: 1,
    q: '',
    provider: 'all',
    type: 'all',
    sortField: '',
    sortDirection: 'asc',
  });

  const [searchInput, setSearchInput] = useState(search?.q || '');

  const debouncedSearch = useMemo(
    () =>
      debounce((query: string) => {
        setSearch({ q: query, page: 1 });
      }, 300),
    [setSearch]
  );

  useEffect(() => {
    setSearchInput(search?.q || '');
  }, [search?.q]);

  const {
    data: modelData = [],
    loading,
    mutate,
  } = useRequest(
    async () => {
      const url = '/api/ai-providers/models';
      const response = await api.get(url);
      return response.data || [];
    },
    {
      onError: (error) => {
        Toast.error(formatError(error));
      },
    }
  );

  useSubscription(
    'model.status.updated',
    ({ provider, model, available, error }: { provider: string; model: string; available: boolean; error: any }) => {
      mutate((r: any) => {
        return r.map((item: any) => {
          if (item.provider === provider && item.model === model && item.status) {
            return {
              ...item,
              loading: false,
              status: {
                ...item.status,
                available,
                error,
              },
            };
          }

          return item;
        });
      });
    },
    []
  );

  const filteredData = useMemo(() => {
    let filtered = modelData as ModelData[];

    if (search?.q) {
      const query = search.q.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.model.toLowerCase().includes(query) ||
          item.provider.toLowerCase().includes(query) ||
          item.providerDisplayName?.toLowerCase().includes(query)
      );
    }

    if (search?.provider && search.provider !== 'all') {
      filtered = filtered.filter((item) => item.provider === search.provider);
    }

    if (search?.type && search.type !== 'all') {
      filtered = filtered.filter((item) => item.type === search.type);
    }

    // Apply sorting
    if (search?.sortField) {
      filtered = [...filtered].sort((a, b) => {
        let valueA = 0;
        let valueB = 0;

        if (search.sortField === 'inputPrice') {
          valueA = a.input_credits_per_token || 0;
          valueB = b.input_credits_per_token || 0;
        } else if (search.sortField === 'outputPrice') {
          valueA = a.output_credits_per_token || 0;
          valueB = b.output_credits_per_token || 0;
        }

        const result = valueA - valueB;
        return search.sortDirection === 'desc' ? -result : result;
      });
    }

    return {
      list: filtered.slice((search.page - 1) * search.pageSize, search.page * search.pageSize),
      count: filtered.length,
    };
  }, [modelData, search]);

  const handleSort = (field: string) => {
    const newDirection = search?.sortField === field && search?.sortDirection === 'asc' ? 'desc' : 'asc';
    setSearch({ sortField: field, sortDirection: newDirection, page: 1 });
  };

  const getSortIcon = (field: string) => {
    if (search?.sortField !== field) return null;
    return search?.sortDirection === 'asc' ? <ArrowDropDown fontSize="small" /> : <ArrowDropUp fontSize="small" />;
  };

  // Get unique providers
  const availableProviders = useMemo(() => {
    const providerMap: Record<string, string> = {};
    modelData.forEach((item: ModelData) => {
      if (!providerMap[item.provider]) {
        providerMap[item.provider] = item.providerDisplayName || item.provider;
      }
    });

    return Object.entries(providerMap).map(([provider, displayName]) => ({ provider, displayName }));
  }, [modelData]);

  const typeCategories = [
    {
      key: 'all',
      label: t('pricing.filters.allModels'),
      icon: <AllInclusiveOutlined />,
    },
    {
      key: 'chat',
      label: t('modelTypes.chatCompletion'),
      icon: <Icon icon="ph:text-t" />,
    },
    {
      key: 'image_generation',
      label: t('modelTypes.imageGeneration'),
      icon: <Icon icon="ri:image-line" />,
    },
    {
      key: 'embedding',
      label: t('modelTypes.embedding'),
      icon: <Icon icon="oui:vector" />,
    },
    // {
    //   key: 'audio_transcription',
    //   label: t('pricing.filters.audioTranscription'),
    //   icon: <AudioFileOutlined />,
    // },
  ];

  // Table columns configuration
  const columns = [
    {
      name: 'model',
      label: t('pricing.table.model'),
      width: 400,
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const model = filteredData.list[tableMeta.rowIndex];
          if (!model) return null;

          return (
            <Stack gap={1}>
              <Box display="flex" alignItems="flex-end" gap={1}>
                <Box sx={{ width: 24, height: 24, position: 'relative' }}>
                  <Avatar
                    src={joinURL(getPrefix(), `/logo/${model.provider}.png`)}
                    sx={{ width: '100%', height: '100%' }}
                    alt={model.provider}
                  />

                  <Box sx={{ position: 'absolute', right: 0, bottom: 0 }}>
                    <Status model={model} t={t} onlyIcon />
                  </Box>
                </Box>

                <Typography variant="subtitle1">{model.model}</Typography>
              </Box>

              <Stack direction="column" spacing={0.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {model.providerDisplayName || model.provider}
                  </Typography>
                  <Divider orientation="vertical" flexItem />
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                    }}>
                    {t('pricing.table.contextWindow')}:{' '}
                    {model.modelMetadata?.maxTokens ? formatNumber(model.modelMetadata?.maxTokens) : '-'}
                  </Typography>
                </Stack>
              </Stack>
            </Stack>
          );
        },
      },
    },
    {
      name: 'type',
      label: t('pricing.table.type'),
      align: 'left',
      width: 120,
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const model = filteredData.list[tableMeta.rowIndex];
          if (!model) return null;
          const icon = typeCategories.find((category) => category.key === model.type)?.icon;
          return (
            <Box display="flex" alignItems="center" justifyContent="flex-start">
              <Box
                display="flex"
                alignItems="self-end"
                justifyContent="center"
                gap={0.5}
                sx={{ border: '1px solid', borderColor: 'divider', px: 1.35, py: 0.5, pb: 0.75, borderRadius: 2 }}>
                <Box sx={{ width: 14, height: 14, svg: { width: '100%', height: '100%' } }}>{icon}</Box>
                <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1 }}>
                  {t(`modelTypes.${TYPE_MAPPING[model.type] || model.type}`)}
                </Typography>
              </Box>
            </Box>
          );
        },
      },
    },
    {
      name: 'inputRate',
      label: t('pricing.table.inputPrice'),
      align: 'right',
      options: {
        customHeadLabelRender: () => {
          return (
            <Button
              variant="text"
              size="small"
              onClick={() => handleSort('inputPrice')}
              endIcon={getSortIcon('inputPrice')}
              sx={{
                color: 'text.primary',
                '&:hover': {
                  backgroundColor: 'transparent',
                },
              }}>
              {t('pricing.table.inputPrice')}
            </Button>
          );
        },
        customBodyRender: (_value: any, tableMeta: any) => {
          const model = filteredData.list[tableMeta.rowIndex];
          if (!model) return null;

          if (model.input_credits_per_token === 0) return '-';

          return (
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  justifyContent: 'flex-end',
                }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: 'primary.main',
                  }}>
                  {getPrice(model.input_credits_per_token, 0, model.type === 'image_generation')} credits
                </Typography>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    fontSize: 14,
                  }}>
                  / 1M tokens
                </Typography>
              </Box>
              {window.blocklet.preferences.baseCreditPrice && (
                <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
                  {`$${getPrice(new Decimal(model.input_credits_per_token).mul(new Decimal(window.blocklet.preferences.baseCreditPrice || 10)), 2, model.type === 'image_generation')}`}
                </Box>
              )}
            </Box>
          );
        },
      },
    },
    {
      name: 'outputRate',
      label: t('pricing.table.outputPrice'),
      align: 'right',
      options: {
        customHeadLabelRender: () => {
          return (
            <Button
              variant="text"
              size="small"
              onClick={() => handleSort('outputPrice')}
              endIcon={getSortIcon('outputPrice')}
              sx={{
                color: 'text.primary',
                '&:hover': {
                  backgroundColor: 'transparent',
                },
              }}>
              {t('pricing.table.outputPrice')}
            </Button>
          );
        },
        customBodyRender: (_value: any, tableMeta: any) => {
          const model = filteredData.list[tableMeta.rowIndex];
          if (!model) return null;

          if (model.output_credits_per_token === 0) return '-';

          let unit = '1M tokens';
          if (model.type === 'image_generation') {
            unit = 'image';
          }

          return (
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  justifyContent: 'flex-end',
                }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: 'primary.main',
                    fontWeight: '700',
                  }}>
                  {getPrice(model.output_credits_per_token, 0, model.type === 'image_generation')} credits
                </Typography>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    fontSize: 14,
                  }}>
                  / {unit}
                </Typography>
              </Box>
              {window.blocklet.preferences.baseCreditPrice && (
                <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
                  {`$${getPrice(new Decimal(model.output_credits_per_token).mul(new Decimal(window.blocklet.preferences.baseCreditPrice || 10)), 2, model.type === 'image_generation')}`}
                </Box>
              )}
            </Box>
          );
        },
      },
    },
  ];

  return (
    <>
      <Header
        meta={undefined}
        addons={undefined}
        sessionManagerProps={undefined}
        homeLink={undefined}
        theme={undefined}
        hideNavMenu={undefined}
        maxWidth={false}
        sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
      />

      <Container
        maxWidth="lg"
        sx={{
          mt: {
            xs: 2,
            md: 4,
          },
        }}>
        <Box
          sx={{
            textAlign: 'center',
            mb: 6,
          }}>
          <Typography
            variant="h1"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
            }}>
            {t('pricing.title')}
          </Typography>
        </Box>
        <Box sx={{ mb: { xs: 3, md: 5 }, mt: { xs: 5, md: 10 } }}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            flexDirection={{ xs: 'column', md: 'row' }}
            gap={1}>
            {/* Type Filter Buttons */}
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
              }}>
              {typeCategories.map((category) => {
                const isSelected = (search?.type || 'all') === category.key;
                return (
                  <Button
                    key={category.key}
                    variant={isSelected ? 'outlined' : 'text'}
                    onClick={() => setSearch({ type: category.key, page: 1 })}
                    sx={{
                      px: 2,
                      height: 40,
                      fontWeight: 600,
                      color: isSelected ? 'text.secondary' : 'text.secondary',
                      borderColor: isSelected ? 'divider' : 'transparent',
                      '&:hover': {
                        borderColor: isSelected ? 'text.secondary' : 'transparent',
                        backgroundColor: isSelected ? 'action.hover' : 'transparent',
                      },
                    }}
                    startIcon={category.icon}>
                    {category.label}
                  </Button>
                );
              })}
            </Box>

            {/* Search and Filter Row */}
            <SearchRow sx={{ minWidth: { xs: '100%', md: 500 } }}>
              <TextField
                fullWidth
                placeholder={t('pricing.searchPlaceholder')}
                value={searchInput}
                onChange={({ target: { value } }) => {
                  setSearchInput(value);
                  debouncedSearch(value);
                }}
                size="small"
                slotProps={{
                  htmlInput: {
                    startAdornment: (
                      <Box sx={{ px: 1 }}>
                        <Box
                          component={SearchIcon}
                          sx={{
                            color: 'grey.500',
                            height: 16,
                            width: 16,
                          }}
                        />
                      </Box>
                    ),
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'divider',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'divider',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'divider',
                      borderWidth: 1,
                    },
                  },
                }}
              />

              <FormControl
                size="small"
                sx={{
                  width: 300,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider',
                  },
                }}>
                <Select
                  size="small"
                  value={search?.provider || 'all'}
                  onChange={(e) => setSearch({ provider: e.target.value === 'all' ? '' : e.target.value, page: 1 })}>
                  <MenuItem value="all">{t('pricing.filters.allProviders')}</MenuItem>
                  {availableProviders.map((provider) => (
                    <MenuItem key={provider.provider} value={provider.provider}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          alignItems: 'center',
                        }}>
                        <Avatar
                          src={joinURL(getPrefix(), `/logo/${provider.provider}.png`)}
                          sx={{ width: 20, height: 20 }}
                          alt={provider.provider}
                        />
                        <Typography variant="body2">{provider.displayName}</Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </SearchRow>
          </Box>
        </Box>
        <Root>
          <Table
            hasSearch={false}
            durable={`__${listKey}__`}
            data={filteredData.list}
            columns={columns}
            toolbar={false}
            options={{
              count: filteredData.count,
              page: (search?.page || 1) - 1,
              rowsPerPage: search?.pageSize || 10,
              rowsPerPageOptions: [10, 25, 50, 100],
            }}
            onChange={({ page, rowsPerPage }: { page: number; rowsPerPage: number }) => {
              if (search?.pageSize !== rowsPerPage) {
                setSearch({ pageSize: rowsPerPage, page: 1 });
              } else if (search?.page !== page + 1) {
                setSearch({ page: page + 1 });
              }
            }}
            loading={loading}
            mobileTDFlexDirection="row"
          />
        </Root>
      </Container>
    </>
  );
}

const Root = styled(Box)`
  @media (max-width: ${({ theme }: { theme: any }) => theme.breakpoints.values.md}px) {
    .MuiTable-root > .MuiTableBody-root > .MuiTableRow-root > td.MuiTableCell-root {
      align-items: center !important;
      padding-bottom: 8px;

      &:first-of-type > div:first-of-type {
        display: none;
      }

      > div {
        width: fit-content;
        flex: inherit;
        font-size: 14px;
        margin: 0;
      }
    }
  }
`;
