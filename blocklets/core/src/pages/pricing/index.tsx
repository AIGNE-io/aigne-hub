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
import {
  AllInclusiveOutlined,
  ArrowDropDown,
  ArrowDropUp,
  ChatOutlined,
  CropOutlined,
  ImageOutlined,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  FormControl,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useRequest, useSetState } from 'ahooks';
import { debounce } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import { joinURL } from 'ufo';

import { useSessionContext } from '../../contexts/session';

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
  margin-bottom: 24px;
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

  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('sm'));

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
    ({ provider, model, available }: { provider: string; model: string; available: boolean }) => {
      mutate((r: any) => {
        r.forEach((item: any) => {
          if (item.provider === provider && item.model === model && item.status) {
            item.loading = false;
            item.status.available = available;
          }
        });

        return r;
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
      icon: <ChatOutlined />,
    },
    {
      key: 'image_generation',
      label: t('modelTypes.imageGeneration'),
      icon: <ImageOutlined />,
    },
    {
      key: 'embedding',
      label: t('modelTypes.embedding'),
      icon: <CropOutlined />,
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
      width: '60%',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const model = filteredData.list[tableMeta.rowIndex];
          if (!model) return null;
          if (isMobile) {
            return (
              <Stack direction="column" alignItems="flex-end">
                <Typography variant="subtitle1">{model.model}</Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                  }}>
                  {t('pricing.table.contextWindow')}:{' '}
                  {model.modelMetadata?.maxTokens ? formatNumber(model.modelMetadata?.maxTokens) : '-'}
                </Typography>
              </Stack>
            );
          }

          return (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: 'center',
              }}>
              <Avatar
                src={joinURL(getPrefix(), `/logo/${model.provider}.png`)}
                sx={{ width: 20, height: 20 }}
                alt={model.provider}
              />
              <Stack direction="column" spacing={0.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="subtitle1">{model.model}</Typography>

                  <Status model={model} t={t} />
                </Stack>
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
    ...(isMobile
      ? [
          {
            name: 'provider',
            label: t('pricing.table.provider'),
            options: {
              customBodyRender: (_value: any, tableMeta: any) => {
                const model = filteredData.list[tableMeta.rowIndex];
                if (!model) return null;
                return (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Avatar
                      src={joinURL(getPrefix(), `/logo/${model.provider}.png`)}
                      sx={{ width: 20, height: 20 }}
                      alt={model.provider}
                    />
                    <Typography variant="body2">{model.providerDisplayName || model.provider}</Typography>
                  </Stack>
                );
              },
            },
          },
          {
            name: 'status',
            label: t('pricing.table.status'),
            options: {
              customBodyRender: (_value: any, tableMeta: any) => {
                const model = filteredData.list[tableMeta.rowIndex];
                if (!model) return null;
                const isAvailable = model.active !== false;
                return (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        bgcolor: isAvailable ? 'success.main' : 'warning.main',
                        borderRadius: '50%',
                      }}
                    />
                    <Typography variant="body2" sx={{ color: isAvailable ? 'success.main' : 'warning.main' }}>
                      {t(`pricing.status.${isAvailable ? 'available' : 'pending'}`)}
                    </Typography>
                  </Stack>
                );
              },
            },
          },
        ]
      : []),
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
            <Button
              startIcon={icon}
              size="small"
              component="span"
              variant="text"
              sx={{ color: 'text.primary', fontWeight: 'normal' }}>
              {t(`modelTypes.${TYPE_MAPPING[model.type] || model.type}`)}
            </Button>
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
            <Box
              sx={{
                textAlign: 'right',
              }}>
              <Typography
                variant="subtitle1"
                sx={{
                  color: 'primary.main',
                }}>
                {formatNumber(model.input_credits_per_token)} credits
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}>
                / per token
              </Typography>
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

          let unit = 'token';
          if (model.type === 'image_generation') {
            unit = 'image';
          }

          return (
            <Box
              sx={{
                textAlign: 'right',
              }}>
              <Typography
                variant="subtitle1"
                sx={{
                  color: 'primary.main',
                  fontWeight: '700',
                }}>
                {formatNumber(model.output_credits_per_token)} credits
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}>
                / per {unit}
              </Typography>
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
            mb: 4,
          }}>
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            sx={{
              fontWeight: 'bold',
            }}>
            {t('pricing.title')}
          </Typography>
          <Typography
            variant="h6"
            sx={{
              color: 'text.secondary',
              maxWidth: 600,
              mx: 'auto',
            }}>
            {t('pricing.subtitle')}
          </Typography>
        </Box>
        <Box
          sx={{
            mb: {
              xs: 3,
              md: 5,
            },
          }}>
          {/* Search and Filter Row */}
          <SearchRow>
            <TextField
              fullWidth
              placeholder={t('pricing.searchPlaceholder')}
              value={searchInput}
              onChange={({ target: { value } }) => {
                setSearchInput(value);
                debouncedSearch(value);
              }}
              slotProps={{
                htmlInput: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
              variant="outlined"
              size="medium"
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: 44,
                },
              }}
            />
            <FormControl
              size="medium"
              sx={{
                minWidth: { xs: '100%', lg: 200 },
              }}>
              <Select
                value={search?.provider || 'all'}
                onChange={(e) => setSearch({ provider: e.target.value === 'all' ? '' : e.target.value, page: 1 })}
                sx={{
                  height: 44,
                }}>
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
                  variant={isSelected ? 'contained' : 'outlined'}
                  onClick={() => setSearch({ type: category.key, page: 1 })}
                  sx={{
                    px: 2,
                    fontWeight: 600,
                    color: isSelected ? 'white' : 'text.primary',
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    bgcolor: isSelected ? 'primary.main' : 'background.paper',
                    '&:hover': {
                      bgcolor: isSelected ? 'primary.main' : 'action.hover',
                    },
                  }}
                  startIcon={category.icon}>
                  {category.label}
                </Button>
              );
            })}
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
      > div {
        width: fit-content;
        flex: inherit;
        font-size: 14px;
      }
    }
  }
`;
