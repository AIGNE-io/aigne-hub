import { DateRangePicker } from '@app/components/analytics';
import { toUTCTimestamp } from '@app/components/analytics/skeleton';
import api from '@app/libs/api';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Table } from '@blocklet/aigne-hub/components';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Search } from '@mui/icons-material';
import { Box, Chip, Stack, TextField, Tooltip, Typography, useTheme } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useDebounceEffect, useRequest } from 'ahooks';
import { useEffect, useState } from 'react';

import dayjs from '../../../../libs/dayjs';

interface ProjectCallHistoryProps {
  appDid: string;
  dateRange: { from: number; to: number };
  onDateRangeChange: (dateRange: { from: number; to: number }) => void;
  allUsers?: boolean;
}

interface ModelCallItem {
  id: string;
  traceId?: string;
  createdAt: string;
  model: string;
  type: string;
  status: 'success' | 'failed' | 'processing';
  totalUsage: number;
  credits: number;
  duration?: number;
  errorReason?: string;
}

export function ProjectCallHistory({
  appDid,
  dateRange: externalDateRange,
  onDateRangeChange,
  allUsers = false,
}: ProjectCallHistoryProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';

  const [searchValue, setSearchValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'errors' | 'slow'>('all');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });
  const slowThresholdSeconds = 30;
  const searchFields = 'traceId,model,id,userDid';
  const startDate = dayjs.unix(externalDateRange.from).local();
  const endDate = dayjs.unix(externalDateRange.to).local();

  useDebounceEffect(
    () => {
      setSearchTerm(searchValue.trim());
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
    },
    [searchValue],
    { wait: 400 }
  );

  useEffect(() => {
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [statusFilter]);

  useEffect(() => {
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [externalDateRange]);

  const handleQuickDateSelect = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    onDateRangeChange({
      from: toUTCTimestamp(range.start),
      to: toUTCTimestamp(range.end, true),
    });
  };

  const { data = { list: [], count: 0 }, loading } = useRequest(
    () =>
      api
        .get('/api/user/model-calls', {
          params: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            startTime: externalDateRange.from,
            endTime: externalDateRange.to,
            appDid,
            ...(allUsers ? { allUsers } : {}),
            ...(searchTerm ? { search: searchTerm } : {}),
            ...(searchTerm ? { searchFields } : {}),
            ...(statusFilter === 'errors' ? { status: 'failed' } : {}),
            ...(statusFilter === 'slow' ? { minDurationSeconds: slowThresholdSeconds } : {}),
          },
        })
        .then((res) => res.data),
    {
      refreshDeps: [pagination, searchTerm, statusFilter, externalDateRange, appDid, allUsers],
    }
  );

  const modelCalls = data?.list || [];
  const total = data?.count || 0;

  const formatLatency = (duration?: number) => {
    if (duration === undefined || duration === null) return '-';
    return `${Number(duration).toFixed(1)}s`;
  };

  const getStatusColor = (call: ModelCallItem) => {
    if (call.status === 'failed') return theme.palette.error.main;
    if ((call.duration || 0) >= slowThresholdSeconds) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  const columns = [
    {
      name: 'status',
      label: ' ',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          const statusLabel = call.status === 'failed' ? t('failed') : t('success');
          return (
            <Tooltip title={call.status === 'failed' ? call.errorReason || t('failed') : statusLabel}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(call),
                }}
              />
            </Tooltip>
          );
        },
      },
    },
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
      name: 'traceId',
      label: 'Trace ID',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          const traceId = call.traceId || call.id;
          const color = call.status === 'failed' ? theme.palette.error.main : 'primary.main';
          return (
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                color,
                fontWeight: 500,
                minHeight: '30px',
                display: 'flex',
                alignItems: 'center',
              }}>
              {traceId}
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
          return <Typography variant="body2">{call.model}</Typography>;
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
          const typeKey = `modelTypes.${call.type}`;
          let displayName = call.type;
          try {
            displayName = t(typeKey);
          } catch {
            displayName = call.type;
          }
          return <Typography variant="body2">{displayName}</Typography>;
        },
      },
    },
    {
      name: 'tokens',
      label: 'Tokens',
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return <Typography variant="body2">{formatNumber(call.totalUsage, 0, true)}</Typography>;
        },
      },
    },
    {
      name: 'latency',
      label: t('duration'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          const isSlow = (call.duration || 0) >= slowThresholdSeconds;
          return (
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                color: isSlow ? theme.palette.warning.main : 'inherit',
              }}>
              {formatLatency(call.duration)}
            </Typography>
          );
        },
      },
    },
    {
      name: 'cost',
      label: t('creditsValue'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {creditPrefix}
              {formatNumber(call.credits)}
            </Typography>
          );
        },
      },
    },
  ];

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page: page + 1 }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setPagination({ page: 1, pageSize });
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between' }}>
        <Stack>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            {t('analytics.callHistory')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('analytics.callHistoryDescription')}
          </Typography>
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
        }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap', flexGrow: 1 }}>
          <TextField
            placeholder="Search by Trace ID, Model, ID, or User DID..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
              },
            }}
            size="small"
            sx={{
              width: { xs: '100%', md: 400 },
              '& .MuiInputBase-root': { height: '40px' },
            }}
          />
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
            <Chip
              label="All"
              size="small"
              variant="outlined"
              onClick={() => setStatusFilter('all')}
              sx={{
                height: '40px',
                borderRadius: 1,
                borderColor: statusFilter === 'all' ? 'primary.main' : 'divider',
                color: statusFilter === 'all' ? 'primary.main' : '',
                bgcolor: 'transparent',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                '& .MuiChip-label': { px: 2 },
              }}
            />
            <Chip
              label="Errors"
              size="small"
              variant="outlined"
              onClick={() => setStatusFilter('errors')}
              sx={{
                height: '40px',
                borderRadius: 1,
                borderColor: statusFilter === 'errors' ? 'error.main' : 'divider',
                color: statusFilter === 'errors' ? 'error.main' : '',
                bgcolor: 'transparent',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                '& .MuiChip-label': { px: 2 },
              }}
            />
            <Chip
              label={`Slow (>${slowThresholdSeconds}s)`}
              size="small"
              variant="outlined"
              onClick={() => setStatusFilter('slow')}
              sx={{
                height: '40px',
                borderRadius: 1,
                borderColor: statusFilter === 'slow' ? 'warning.main' : 'divider',
                color: statusFilter === 'slow' ? 'warning.main' : '',
                bgcolor: 'transparent',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                '& .MuiChip-label': { px: 2 },
              }}
            />
          </Stack>
        </Stack>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(date: dayjs.Dayjs | null) =>
              onDateRangeChange({ from: toUTCTimestamp(date || dayjs()), to: externalDateRange.to })
            }
            onEndDateChange={(date: dayjs.Dayjs | null) =>
              onDateRangeChange({ from: externalDateRange.from, to: toUTCTimestamp(date || dayjs(), true) })
            }
            onQuickSelect={handleQuickDateSelect}
            sx={{
              alignSelf: { xs: 'flex-start', md: 'center' },
            }}
          />
        </LocalizationProvider>
      </Stack>

      <Box>
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
            search: false,
            download: false,
            print: false,
            viewColumns: false,
            filter: false,
            selectableRows: 'none',
            responsive: 'vertical',
          }}
          emptyNodeText={
            <Stack spacing={1} sx={{ py: 4, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('analytics.noCallsFoundBetween', {
                  startTime: dayjs.unix(externalDateRange.from).format('YYYY-MM-DD'),
                  endTime: dayjs.unix(externalDateRange.to).format('YYYY-MM-DD'),
                })}
              </Typography>
            </Stack>
          }
          mobileTDFlexDirection="row"
        />
      </Box>
    </Stack>
  );
}
