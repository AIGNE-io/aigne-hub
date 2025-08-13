import { getPrefix } from '@app/libs/util';
/* eslint-disable react/no-unstable-nested-components */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { Table } from '@blocklet/aigne-hub/components';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { formatError } from '@blocklet/error';
import styled from '@emotion/styled';
import { Download, FilterAltOutlined, Search } from '@mui/icons-material';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useDebounceEffect, useRequest } from 'ahooks';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { joinURL } from 'ufo';

import { useSessionContext } from '../../contexts/session';

export interface ModelCall {
  id: string;
  createdAt: string;
  model: string;
  providerId: string;
  type: string;
  status: 'success' | 'failed';
  totalUsage: number;
  credits: number;
  duration?: number;
  errorReason?: string;
  appDid?: string;
  userDid?: string;
}

export interface CallHistoryQuery {
  page?: number;
  pageSize?: number;
  startTime?: string;
  endTime?: string;
  search?: string;
  status?: 'all' | 'success' | 'failed';
}

interface CallHistoryProps {
  title?: string;
  subtitle?: string;
  showUserColumn?: boolean;
  showAppColumn?: boolean;
  dateRange?: {
    from: number;
    to: number;
  };
  initialPageSize?: number;
  enableExport?: boolean;
  refreshKey?: number;
}

function formatDuration(duration?: number) {
  if (!duration) return '-';
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

export function CallHistory({
  title = undefined,
  subtitle = undefined,
  showUserColumn = false,
  showAppColumn = false,
  dateRange = undefined,
  initialPageSize = 10,
  enableExport = true,
  refreshKey = 0,
}: CallHistoryProps) {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();

  // Local state for search and pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: initialPageSize,
  });

  useEffect(() => {
    setSearchValue(searchTerm);
  }, [searchTerm]);

  // 防抖搜索

  useDebounceEffect(
    () => {
      setSearchTerm(searchValue);
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    [searchValue],
    { wait: 500 }
  );

  // Build query parameters
  const buildQuery = (): CallHistoryQuery => {
    const query: CallHistoryQuery = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    };

    if (dateRange) {
      query.startTime = dateRange.from.toString();
      query.endTime = dateRange.to.toString();
    }

    if (searchTerm.trim()) {
      query.search = searchTerm.trim();
    }

    if (statusFilter !== 'all') {
      query.status = statusFilter;
    }

    return query;
  };

  // Fetch data function
  const fetchModelCalls = async (queryParams: CallHistoryQuery = {}) => {
    const response = await api.get('/api/user/model-calls', { params: queryParams });
    return response.data;
  };

  // Data fetching with useRequest
  const { data = { list: [], count: 0 }, loading } = useRequest(() => fetchModelCalls(buildQuery()), {
    refreshDeps: [pagination, searchTerm, statusFilter, dateRange, refreshKey],
    onError: (error: any) => {
      Toast.error(formatError(error));
    },
  });

  const modelCalls = data?.list || [];
  const total = data?.count || 0;

  // Export functionality
  const { run: handleExport, loading: exportLoading } = useRequest(
    async () => {
      const query = buildQuery();
      // Remove pagination for export (get all data)
      delete query.page;
      delete query.pageSize;

      const response = await api.get('/api/user/model-calls/export', {
        params: query,
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `model-calls-${dayjs().format('YYYY-MM-DD')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      Toast.success(t('exportSuccess'));
    },
    {
      manual: true,
      onError: (error: any) => {
        Toast.error(formatError(error));
      },
    }
  );

  // Handle pagination change
  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page: page + 1 }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setPagination({ page: 1, pageSize });
  };

  // 构建基础列
  const baseColumns = [
    {
      name: 'timestamp',
      label: t('analytics.timestamp'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {dayjs(call.createdAt).format('MM-DD HH:mm:ss')}
            </Typography>
          );
        },
      },
    },
    {
      name: 'model',
      label: t('model'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Box>
              <Typography variant="body2">{call.model}</Typography>
            </Box>
          );
        },
      },
    },
    {
      name: 'providerId',
      label: t('provider'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return '-';
          if (!call.provider) return '-';
          return (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Avatar
                src={joinURL(getPrefix(), `/logo/${call.provider.name}.png`)}
                sx={{ width: 24, height: 24 }}
                alt={call.provider.displayName}
              />
              <Typography variant="body2">{call.provider?.displayName}</Typography>
            </Stack>
          );
        },
      },
    },
    {
      name: 'type',
      label: t('type'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;

          // Get translated type name
          const typeKey = `modelTypes.${call.type}`;
          let displayName;
          try {
            displayName = t(typeKey);
          } catch {
            displayName = call.type;
          }

          return displayName;
        },
      },
    },
    {
      name: 'usage',
      label: t('analytics.modelUsage'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;

          let unit;
          switch (call.type) {
            case 'chatcompletion':
            case 'completion':
            case 'embedding':
            case 'transcription':
            case 'speech':
            case 'audiogeneration':
              unit = t('modelUnits.tokens');
              break;
            case 'imagegeneration':
              unit = t('modelUnits.images');
              break;
            case 'videogeneration':
              unit = t('modelUnits.minutes');
              break;
            default:
              unit = t('modelUnits.tokens');
          }

          if (!call.totalUsage) {
            return '-';
          }
          return (
            <Typography variant="body2">
              {formatNumber(call.totalUsage)} {unit}
            </Typography>
          );
        },
      },
    },
    {
      name: 'credits',
      label: t('creditsValue'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {call.credits}
            </Typography>
          );
        },
      },
    },
    {
      name: 'duration',
      label: t('duration'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {formatDuration(call.duration)}
            </Typography>
          );
        },
      },
    },
    {
      name: 'status',
      label: t('status'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Box>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                }}>
                <Chip
                  label={
                    call.status === 'failed' ? (
                      <Tooltip title={call.errorReason}>
                        <Typography component="span" sx={{ fontSize: 'inherit' }}>
                          {t(call.status)}
                        </Typography>
                      </Tooltip>
                    ) : (
                      t(call.status)
                    )
                  }
                  size="small"
                  color={call.status === 'success' ? 'success' : 'error'}
                  variant="outlined"
                />
              </Stack>
            </Box>
          );
        },
      },
    },
  ];

  // 条件性添加列
  const columns = [...baseColumns];
  if (showUserColumn) {
    columns.splice(1, 0, {
      name: 'userDid',
      label: t('user'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {call.userDid ? call.userDid.slice(-8) : '-'}
            </Typography>
          );
        },
      },
    });
  }
  if (showAppColumn) {
    columns.splice(-1, 0, {
      name: 'appDid',
      label: t('application'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return <Typography variant="body2">{call.appDid || '-'}</Typography>;
        },
      },
    });
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}>
        <Stack>
          <Typography variant="h3">{title || t('analytics.callHistory')}</Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}>
            {subtitle || t('analytics.callHistoryDescription')}
          </Typography>
        </Stack>
        {enableExport && (
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleExport}
            disabled={exportLoading}
            size="small">
            {exportLoading ? <CircularProgress size={16} /> : t('export')}
          </Button>
        )}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder={t('analytics.searchPlaceholder')}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
            },
          }}
          size="small"
          sx={{ flexGrow: 1, maxWidth: 400 }}
        />
        <TextField
          select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          size="small"
          slotProps={{
            input: {
              startAdornment: <FilterAltOutlined sx={{ color: 'text.secondary', mr: 0.5 }} fontSize="small" />,
            },
          }}
          sx={{ minWidth: 120 }}>
          <MenuItem value="all">{t('analytics.allStatus')}</MenuItem>
          <MenuItem value="success">{t('success')}</MenuItem>
          <MenuItem value="failed">{t('failed')}</MenuItem>
        </TextField>
      </Stack>
      <Root>
        <Table
          data={modelCalls}
          columns={columns}
          loading={loading}
          options={{
            count: total,
            page: pagination.page - 1,
            rowsPerPage: pagination.pageSize,
            onChangePage: handlePageChange,
            onChangeRowsPerPage: handlePageSizeChange,
            serverSide: true,
            search: false, // 禁用内置搜索，使用自定义搜索
            download: false,
            print: false,
            viewColumns: false,
            filter: false,
            selectableRows: 'none',
            responsive: 'vertical',
          }}
          emptyNodeText={t('analytics.noCallsFound')}
          mobileTDFlexDirection="row"
        />
      </Root>
    </Stack>
  );
}

const Root = styled(Stack)`
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
