import { DateRangePicker } from '@app/components/analytics';
import { toUTCTimestamp } from '@app/components/analytics/skeleton';
import api from '@app/libs/api';
import { getPrefix } from '@app/libs/util';
import type { ProjectTrendSummary } from '@app/pages/customer/hooks';
import { useAIProviders, useAdminUserInfo } from '@app/pages/customer/hooks';
import DID from '@arcblock/ux/lib/DID';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Table } from '@blocklet/aigne-hub/components';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Close, Search } from '@mui/icons-material';
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useDebounceEffect, useRequest } from 'ahooks';
import { ReactNode, useEffect, useState } from 'react';
import { joinURL, withQuery } from 'ufo';

import dayjs from '../../../../libs/dayjs';
import { getObservabilityBlocklet } from '../../../../libs/env';

interface ProjectCallHistoryProps {
  appDid: string;
  dateRange: { from: number; to: number };
  onDateRangeChange: (dateRange: { from: number; to: number }) => void;
  allUsers?: boolean;
  projectMeta?: ProjectTrendSummary;
}

interface ModelCallItem {
  id: string;
  traceId?: string;
  createdAt: string;
  model: string;
  providerId?: string;
  provider?: { name?: string; displayName?: string };
  type: string;
  status: 'success' | 'failed' | 'processing';
  totalUsage: number;
  usageMetrics?: { inputTokens?: number; outputTokens?: number };
  credits: number;
  duration?: number;
  errorReason?: string;
  appDid?: string;
  appInfo?: { appName: string; appDid: string; appLogo?: string; appUrl?: string };
  userDid?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

interface ModelCallResponse {
  list: ModelCallItem[];
  count: number;
}

export function ProjectCallHistory({
  appDid,
  dateRange: externalDateRange,
  onDateRangeChange,
  allUsers = false,
  projectMeta,
}: ProjectCallHistoryProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';
  const observabilityBlocklet = getObservabilityBlocklet();
  const { providerMap } = useAIProviders();

  const [searchValue, setSearchValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'errors' | 'slow' | 'success'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });
  const [selectedCall, setSelectedCall] = useState<ModelCallItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  }, [typeFilter]);

  useEffect(() => {
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [externalDateRange]);

  const handleQuickDateSelect = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    onDateRangeChange({
      from: toUTCTimestamp(range.start),
      to: toUTCTimestamp(range.end, true),
    });
  };

  const { data = { list: [], count: 0 }, loading } = useRequest<ModelCallResponse, any>(
    () =>
      api
        .get(`/api/usage/projects/${encodeURIComponent(appDid)}/calls`, {
          params: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            startTime: externalDateRange.from,
            endTime: externalDateRange.to,
            ...(allUsers ? { allUsers } : {}),
            ...(searchTerm ? { search: searchTerm } : {}),
            ...(searchTerm ? { searchFields } : {}),
            ...(statusFilter === 'errors' ? { status: 'failed' } : {}),
            ...(statusFilter === 'success' ? { status: 'success' } : {}),
            ...(statusFilter === 'slow' ? { minDurationSeconds: slowThresholdSeconds } : {}),
            ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
          },
        })
        .then((res) => res.data),
    {
      refreshDeps: [pagination, searchTerm, statusFilter, typeFilter, externalDateRange, appDid, allUsers],
    }
  );

  const modelCalls = data?.list || [];
  const total = data?.count || 0;

  const { userInfoMap } = useAdminUserInfo({
    userDids: modelCalls.map((call) => call.userDid).filter((did): did is string => Boolean(did)),
    enabled: allUsers,
  });

  const formatLatency = (duration?: number) => {
    if (duration === undefined || duration === null) return '-';
    return `${Number(duration).toFixed(1)}s`;
  };

  const formatTraceId = (value?: string) => {
    if (!value) return '-';
    if (value.length <= 8) return value;
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  };

  const getTypeLabel = (type?: string) => {
    if (!type) return '-';
    const typeKey = `modelTypes.${type}`;
    try {
      return t(typeKey);
    } catch {
      return type;
    }
  };

  const formatUsageParts = (call: ModelCallItem) => {
    if (!call.totalUsage) {
      return null;
    }

    const normalizedType = call.type?.toLowerCase?.() || '';
    let unit: string | undefined;
    switch (normalizedType) {
      case 'imagegeneration':
        unit = call.totalUsage > 1 ? t('modelUnits.images') : t('modelUnits.image');
        break;
      case 'video':
        unit = t('modelUnits.seconds');
        break;
      default:
        unit = t('modelUnits.tokens');
    }

    const formatted = formatNumber(call.totalUsage, 0, true);
    return { formatted, unit };
  };

  const typeOptions = [
    { value: 'all', label: t('analytics.allTypes') },
    { value: 'chatCompletion', label: t('modelTypes.chatCompletion') },
    { value: 'imageGeneration', label: t('modelTypes.imageGeneration') },
    { value: 'embedding', label: t('modelTypes.embedding') },
    { value: 'video', label: t('modelTypes.video') },
    { value: 'audioGeneration', label: t('modelTypes.audioGeneration') },
    { value: 'custom', label: t('modelTypes.custom') },
  ];

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
          const rawTraceId = call.traceId || call.id;
          const traceId = allUsers ? formatTraceId(rawTraceId) : rawTraceId;
          const canOpenTrace = Boolean(observabilityBlocklet?.mountPoint && call.traceId && allUsers);
          const color = call.status === 'failed' ? theme.palette.error.main : 'primary.main';
          return (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minHeight: '30px' }}>
              <Typography
                variant="body2"
                onClick={() => {
                  if (!canOpenTrace) return;
                  window.open(
                    withQuery(joinURL(window.location.origin, observabilityBlocklet!.mountPoint, '/traces'), {
                      traceId: call.traceId,
                    }),
                    '_blank'
                  );
                }}
                sx={{
                  fontFamily: 'monospace',
                  color,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: canOpenTrace ? 'pointer' : 'default',
                  textDecoration: 'none',
                  '&:hover': canOpenTrace ? { textDecoration: 'underline' } : undefined,
                }}>
                {traceId}
              </Typography>
            </Stack>
          );
        },
      },
    },
    ...(allUsers
      ? [
          {
            name: 'userDid',
            label: t('analytics.userDid'),
            options: {
              customBodyRender: (_value: any, tableMeta: any) => {
                const call = modelCalls[tableMeta.rowIndex];
                if (!call?.userDid) return '-';
                const userInfo = userInfoMap[call.userDid];
                const displayName = userInfo?.fullName || '-';
                const avatarText = (userInfo?.fullName || call.userDid || '?').slice(0, 1);

                return (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Avatar
                        src={userInfo?.avatar}
                        alt={displayName}
                        sx={{
                          width: 34,
                          height: 34,
                          fontSize: 12,
                          bgcolor: 'action.hover',
                          color: 'text.secondary',
                        }}>
                        {avatarText}
                      </Avatar>
                      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
                          {displayName}
                        </Typography>
                        <DID did={call.userDid} compact size={14} />
                      </Box>
                    </Stack>
                  </Box>
                );
              },
            },
          },
        ]
      : []),
    {
      name: 'model',
      label: t('model'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          const provider = providerMap.get(call.providerId || '') || call.provider;
          const providerLabel = provider?.displayName || provider?.name;
          return (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
              {provider?.name && (
                <Tooltip title={providerLabel || provider.name}>
                  <Avatar
                    src={joinURL(getPrefix(), `/logo/${provider.name}.png`)}
                    sx={{ width: 20, height: 20 }}
                    alt={providerLabel || provider.name}
                  />
                </Tooltip>
              )}
              <Typography variant="body2">{call.model}</Typography>
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
          return (
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              {getTypeLabel(call.type)}
            </Typography>
          );
        },
      },
    },
    {
      name: 'tokens',
      label: t('usage'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const call = modelCalls[tableMeta.rowIndex];
          if (!call) return null;
          const usage = formatUsageParts(call);
          if (!usage) return '-';
          return (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 0.5,
                whiteSpace: 'nowrap',
              }}>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {usage.formatted}
              </Typography>
              <Typography variant="body2" sx={{ color: 'grey.400' }}>
                {usage.unit}
              </Typography>
            </Box>
          );
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

  const handleRowClick = (_rowData: any, rowMeta: any) => {
    const call = modelCalls[rowMeta.dataIndex];
    if (!call) return;
    setSelectedCall(call);
    setDrawerOpen(true);
  };

  const cardSx = {
    borderRadius: 3,
    border: '1px solid',
    borderColor: 'divider',
    px: 2.5,
    py: 2,
    bgcolor: 'background.paper',
    // boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 8px rgba(16, 24, 40, 0.06)',
  } as const;

  const renderMetricCard = (label: string, value?: ReactNode) => {
    const content = value ?? '-';
    const isPrimitive = typeof content === 'string' || typeof content === 'number';
    return (
      <Box sx={cardSx}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        {isPrimitive ? (
          <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 500, letterSpacing: 0.2 }}>
            {content}
          </Typography>
        ) : (
          <Box sx={{ mt: 0.5 }}>{content}</Box>
        )}
      </Box>
    );
  };

  const statusColor =
    selectedCall?.status === 'failed'
      ? theme.palette.error.main
      : selectedCall?.status === 'processing'
        ? theme.palette.warning.main
        : theme.palette.success.main;

  const resolvedProjectMeta = projectMeta ?? selectedCall?.appInfo ?? (appDid ? { appDid, appName: appDid } : null);
  const appLogoSrc =
    resolvedProjectMeta?.appUrl && resolvedProjectMeta?.appLogo
      ? joinURL(resolvedProjectMeta.appUrl, resolvedProjectMeta.appLogo)
      : resolvedProjectMeta?.appLogo;
  const projectName = resolvedProjectMeta?.appName || resolvedProjectMeta?.appDid || appDid || '-';
  const projectDid = resolvedProjectMeta?.appDid || appDid || '-';
  const selectedUser = selectedCall?.userDid ? userInfoMap[selectedCall.userDid] : undefined;
  const selectedUserName = selectedUser?.fullName || '-';
  const selectedUserAvatarText = (selectedUser?.fullName || selectedCall?.userDid || '?').slice(0, 1);
  const showUserCard = Boolean(selectedUser && (selectedUser.fullName || selectedUser.avatar || selectedUser.email));
  const selectedProvider = providerMap.get(selectedCall?.providerId || '') || selectedCall?.provider;
  const selectedProviderLabel = selectedProvider?.displayName || selectedProvider?.name;
  const canOpenSelectedTrace = Boolean(observabilityBlocklet?.mountPoint && selectedCall?.traceId && allUsers);
  const selectedTraceId = selectedCall?.traceId || selectedCall?.id || '-';
  const selectedUsageParts = selectedCall ? formatUsageParts(selectedCall) : null;
  const selectedType = selectedCall?.type?.toLowerCase?.() || '';
  const showMediaUsage = selectedType === 'imagegeneration' || selectedType === 'video';

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
          useFlexGap
          sx={{
            alignItems: { md: 'center' },
            flexWrap: 'wrap',
            flexGrow: 1,
            rowGap: 1,
            width: { xs: '100%', md: 'auto' },
          }}>
          <TextField
            placeholder="Trace ID, Model, ID, User DID..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
              },
            }}
            size="small"
            sx={{
              width: { xs: '100%', md: 300 },
              '& .MuiInputBase-root': { height: '40px' },
            }}
          />
          <TextField
            select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 120, width: { xs: '100%', md: 'auto' }, '& .MuiInputBase-root': { height: '40px' } }}>
            {typeOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            size="small"
            sx={{ minWidth: 160, width: { xs: '100%', md: 'auto' }, '& .MuiInputBase-root': { height: '40px' } }}>
            <MenuItem value="all">{t('analytics.allStatus')}</MenuItem>
            <MenuItem value="success">{t('analytics.success')}</MenuItem>
            <MenuItem value="errors">{t('analytics.errors')}</MenuItem>
            <MenuItem value="slow">{t('analytics.slow', { seconds: slowThresholdSeconds })}</MenuItem>
          </TextField>
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
              width: { xs: '100%', md: 'auto' },
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
            onRowClick: handleRowClick,
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

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        anchor="right"
        slotProps={{
          paper: {
            sx: {
              width: { xs: '100%', sm: 520, md: 640 },
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            },
          },
        }}>
        <Stack spacing={2.5} sx={{ p: 3, height: '100%', overflow: 'auto' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: statusColor,
                }}
              />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 0.3 }}>
                  {t('analytics.callDetailTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedCall?.createdAt ? dayjs(selectedCall.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
                </Typography>
              </Box>
            </Stack>
            <IconButton onClick={() => setDrawerOpen(false)} size="small">
              <Close fontSize="small" />
            </IconButton>
          </Stack>

          <Divider />

          <Stack spacing={2.5}>
            {selectedCall?.errorReason && (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'error.light',
                  border: '1px solid',
                  borderColor: 'error.main',
                  borderRadius: 2,
                  color: 'error.contrastText',
                  wordBreak: 'break-word',
                  fontSize: 14,
                }}>
                {selectedCall.errorReason}
              </Box>
            )}

            <Stack spacing={1.5}>
              <Box sx={cardSx}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Avatar
                    src={appLogoSrc}
                    alt={projectName || 'app'}
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 4,
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                      fontSize: 16,
                    }}>
                    {(projectName || '?').slice(0, 1)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                      {projectName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {projectDid}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Stack>

            {showUserCard && selectedCall?.userDid && (
              <Box sx={cardSx}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Avatar
                    src={selectedUser?.avatar}
                    alt={selectedUserName}
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 4,
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                      fontSize: 16,
                    }}>
                    {selectedUserAvatarText}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                      {selectedUserName}
                    </Typography>
                    <DID did={selectedCall.userDid} compact size={14} />
                  </Box>
                </Stack>
              </Box>
            )}

            {renderMetricCard(
              t('analytics.traceId'),
              selectedTraceId ? (
                <Typography
                  variant="h6"
                  onClick={() => {
                    if (!canOpenSelectedTrace) return;
                    window.open(
                      withQuery(joinURL(window.location.origin, observabilityBlocklet!.mountPoint, '/traces'), {
                        traceId: selectedCall?.traceId,
                      }),
                      '_blank'
                    );
                  }}
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    cursor: canOpenSelectedTrace ? 'pointer' : 'default',
                    textDecoration: 'none',
                    '&:hover': canOpenSelectedTrace ? { textDecoration: 'underline' } : undefined,
                  }}>
                  {selectedTraceId}
                </Typography>
              ) : (
                '-'
              )
            )}

            <Stack spacing={1.5}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}>
                {!showMediaUsage && (
                  <>
                    {renderMetricCard(
                      t('analytics.inputTokens'),
                      selectedCall?.usageMetrics?.inputTokens !== undefined
                        ? formatNumber(selectedCall.usageMetrics.inputTokens, 0, true)
                        : '-'
                    )}
                    {renderMetricCard(
                      t('analytics.outputTokens'),
                      selectedCall?.usageMetrics?.outputTokens !== undefined
                        ? formatNumber(selectedCall.usageMetrics.outputTokens, 0, true)
                        : '-'
                    )}
                  </>
                )}
                {showMediaUsage && (
                  <Box sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }}>
                    {renderMetricCard(
                      t('usage'),
                      selectedUsageParts ? `${selectedUsageParts.formatted} ${selectedUsageParts.unit}` : '-'
                    )}
                  </Box>
                )}
                {renderMetricCard(
                  t('creditsValue'),
                  selectedCall ? `${creditPrefix}${formatNumber(selectedCall.credits)}` : '-'
                )}
                {renderMetricCard(t('duration'), formatLatency(selectedCall?.duration))}
              </Box>
            </Stack>

            <Stack spacing={1.5}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}>
                {renderMetricCard(
                  t('provider'),
                  selectedProvider?.name ? (
                    <Tooltip title={selectedProviderLabel || selectedProvider.name}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Avatar
                          src={joinURL(getPrefix(), `/logo/${selectedProvider.name}.png`)}
                          sx={{ width: 24, height: 24 }}
                          alt={selectedProviderLabel || selectedProvider.name}
                        />
                        <Typography variant="body2">{selectedProviderLabel || selectedProvider.name}</Typography>
                      </Stack>
                    </Tooltip>
                  ) : (
                    '-'
                  )
                )}
                {renderMetricCard(t('model'), selectedCall?.model || '-')}
              </Box>
            </Stack>
          </Stack>
        </Stack>
      </Drawer>
    </Stack>
  );
}
