/* eslint-disable react/no-unstable-nested-components */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Table } from '@blocklet/aigne-hub/components';
import { Cancel, CheckCircle, Download, Schedule, Search } from '@mui/icons-material';
import { Box, Button, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import dayjs from 'dayjs';

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

interface CallHistoryProps {
  calls?: ModelCall[];
  loading?: boolean;
  onExport?: () => void;
  exportLoading?: boolean;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  statusFilter?: 'all' | 'success' | 'failed';
  onStatusFilterChange?: (status: 'all' | 'success' | 'failed') => void;
  title?: string;
  subtitle?: string;
  showUserColumn?: boolean;
  showAppColumn?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return <CheckCircle color="success" fontSize="small" />;
    case 'failed':
      return <Cancel color="error" fontSize="small" />;
    default:
      return <Schedule color="warning" fontSize="small" />;
  }
}

function formatDuration(duration?: number) {
  if (!duration) return '-';
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

export function CallHistory({
  calls = [],
  loading = false,
  onExport = () => {},
  exportLoading = false,
  searchTerm = '',
  onSearchChange = () => {},
  statusFilter = 'all',
  onStatusFilterChange = () => {},
  title = undefined,
  subtitle = undefined,
  showUserColumn = false,
  showAppColumn = false,
  pagination = {
    page: 1,
    pageSize: 10,
    total: 0,
    onPageChange: () => {},
  },
}: CallHistoryProps) {
  const { t } = useLocaleContext();

  // 构建基础列
  const baseColumns = [
    {
      name: 'timestamp',
      label: t('analytics.timestamp'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = calls[tableMeta.rowIndex];
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
          const call = calls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                {call.model}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {call.providerId}
              </Typography>
            </Box>
          );
        },
      },
    },
    {
      name: 'type',
      label: t('type'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = calls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Chip
              label={call.type}
              size="small"
              variant="outlined"
              color={call.type === 'imageGeneration' ? 'secondary' : 'default'}
            />
          );
        },
      },
    },
    {
      name: 'usage',
      label: t('usage'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = calls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Typography variant="body2">
              {call.type === 'imageGeneration' ? `${call.totalUsage} ${t('images')}` : call.totalUsage.toLocaleString()}
            </Typography>
          );
        },
      },
    },
    {
      name: 'credits',
      label: t('credits'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = calls[tableMeta.rowIndex];
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
          const call = calls[tableMeta.rowIndex];
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
          const call = calls[tableMeta.rowIndex];
          if (!call) return null;
          return (
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                {getStatusIcon(call.status)}
                <Chip
                  label={call.status}
                  size="small"
                  color={call.status === 'success' ? 'success' : 'error'}
                  variant="outlined"
                />
              </Stack>
              {call.errorReason && (
                <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                  {call.errorReason}
                </Typography>
              )}
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
          const call = calls[tableMeta.rowIndex];
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
          const call = calls[tableMeta.rowIndex];
          if (!call) return null;
          return <Typography variant="body2">{call.appDid || '-'}</Typography>;
        },
      },
    });
  }

  return (
    <Stack spacing={3}>
      {/* 标题区域 */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Stack>
          <Typography variant="h6">{title || t('analytics.callHistory')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle || t('analytics.callHistoryDescription')}
          </Typography>
        </Stack>
        {onExport && (
          <Button variant="outlined" startIcon={<Download />} onClick={onExport} disabled={exportLoading} size="small">
            {exportLoading ? <CircularProgress size={16} /> : t('export')}
          </Button>
        )}
      </Stack>

      {/* 筛选条件 */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder={t('analytics.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => onSearchChange?.(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
          }}
          size="small"
          sx={{ flexGrow: 1, maxWidth: 400 }}
        />
        <TextField
          select
          label={t('status')}
          value={statusFilter}
          onChange={(e) => onStatusFilterChange?.(e.target.value as any)}
          size="small"
          sx={{ minWidth: 120 }}>
          <MenuItem value="all">{t('analytics.allStatus')}</MenuItem>
          <MenuItem value="success">{t('success')}</MenuItem>
          <MenuItem value="failed">{t('failed')}</MenuItem>
        </TextField>
      </Stack>

      {/* 表格 */}
      <Table
        data={calls}
        columns={columns}
        loading={loading}
        options={{
          count: pagination.total,
          page: pagination.page - 1,
          rowsPerPage: pagination.pageSize,
          onChangePage: (page: number) => pagination.onPageChange(page + 1),
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
      />
    </Stack>
  );
}
