import { CallHistory, DateRangePicker, ModelUsageStats, UsageCharts, UsageSummary } from '@app/components/analytics';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { Alert, Box, CircularProgress, Container, Divider, Stack, Typography } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs from 'dayjs';
import { useState } from 'react';

import { CreditsBalance } from './credits-balance';
import { useCreditBalance, useExportModelCalls, useModelCalls, useUsageStats } from './hooks';

// 模拟数据用于展示UI效果
const mockUsageStats = {
  summary: {
    totalCredits: 2640,
    totalCalls: 428,
    byType: {
      chatCompletion: {
        totalUsage: 161000,
        totalCredits: 2100,
        totalCalls: 380,
      },
    },
  },
  dailyStats: [
    { date: '2024-01-24', credits: 230, tokens: 15000, requests: 45 },
    { date: '2024-01-25', credits: 420, tokens: 28000, requests: 78 },
    { date: '2024-01-26', credits: 180, tokens: 12000, requests: 32 },
    { date: '2024-01-27', credits: 610, tokens: 35000, requests: 94 },
    { date: '2024-01-28', credits: 340, tokens: 22000, requests: 56 },
    { date: '2024-01-29', credits: 570, tokens: 31000, requests: 82 },
    { date: '2024-01-30', credits: 290, tokens: 18000, requests: 41 },
  ],
  modelStats: [
    {
      providerId: 'anthropic',
      model: 'Claude Sonnet 4',
      type: 'chatCompletion',
      totalUsage: 186200,
      totalCredits: 1845,
      totalCalls: 248,
      successRate: 98.4,
    },
    {
      providerId: 'openai',
      model: 'GPT-4 Turbo',
      type: 'chatCompletion',
      totalUsage: 98700,
      totalCredits: 1230,
      totalCalls: 166,
      successRate: 99.2,
    },
    {
      providerId: 'openai',
      model: 'DALL-E 3',
      type: 'imageGeneration',
      totalUsage: 45200,
      totalCredits: 890,
      totalCalls: 89,
      successRate: 95.5,
    },
  ],
};

const mockModelCalls = [
  {
    id: '1',
    createdAt: '2024-01-30T14:32:15Z',
    model: 'Claude Sonnet 4',
    providerId: 'anthropic',
    type: 'chatCompletion',
    status: 'success' as const,
    totalUsage: 1245,
    credits: 42,
    duration: 73.4,
    appDid: 'Chat Assistant',
  },
  {
    id: '2',
    createdAt: '2024-01-30T14:28:42Z',
    model: 'GPT-4 Turbo',
    providerId: 'openai',
    type: 'chatCompletion',
    status: 'success' as const,
    totalUsage: 2156,
    credits: 65,
    duration: 45.2,
    appDid: 'Code Generator',
  },
  {
    id: '3',
    createdAt: '2024-01-30T14:25:18Z',
    model: 'DALL-E 3',
    providerId: 'openai',
    type: 'imageGeneration',
    status: 'failed' as const,
    totalUsage: 0,
    credits: 0,
    duration: 16.2,
    errorReason: 'Rate limit exceeded',
    appDid: 'Image Creator',
  },
];

function CreditBoard() {
  const { t } = useLocaleContext();
  const [dateRange, setDateRange] = useState({
    from: dayjs().subtract(7, 'day'),
    to: dayjs(),
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  // API hooks
  const {
    data: creditBalance,
    loading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
  } = useCreditBalance();

  const {
    data: usageStats,
    loading: statsLoading,
    error: statsError,
  } = useUsageStats({
    startTime: dateRange.from.toISOString(),
    endTime: dateRange.to.toISOString(),
  });

  const {
    data: modelCallsData,
    loading: callsLoading,
    error: callsError,
  } = useModelCalls({
    page: 1,
    pageSize: 50,
    startTime: dateRange.from.toISOString(),
    endTime: dateRange.to.toISOString(),
    search: searchTerm || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const { exportCalls, loading: exportLoading } = useExportModelCalls();

  const handleExport = async () => {
    try {
      await exportCalls({
        startTime: dateRange.from.toISOString(),
        endTime: dateRange.to.toISOString(),
        search: searchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleQuickDateSelect = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    setDateRange({ from: range.start, to: range.end });
  };

  // 使用真实数据或模拟数据
  const displayUsageStats = usageStats || mockUsageStats;
  const displayModelCalls = modelCallsData?.data || mockModelCalls;

  const loading = balanceLoading || statsLoading || callsLoading;
  const hasError = balanceError || statsError || callsError;

  if (loading && !creditBalance && !usageStats) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3} alignItems="center" justifyContent="center" sx={{ minHeight: 400 }}>
          <CircularProgress size={60} />
          <Typography variant="h6" color="text.secondary">
            {t('analytics.loadingData')}
          </Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 3 }}>
        <Container maxWidth="xl">
          <Stack spacing={4}>
            {/* Header */}
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
              spacing={2}>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 0.5, color: 'text.primary' }}>
                  {t('analytics.creditUsage')}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {t('analytics.creditBoardDescription')}
                </Typography>
              </Box>
              <DateRangePicker
                startDate={dateRange.from}
                endDate={dateRange.to}
                onStartDateChange={(date: dayjs.Dayjs | null) =>
                  setDateRange((prev) => ({ ...prev, from: date || dayjs() }))
                }
                onEndDateChange={(date: dayjs.Dayjs | null) =>
                  setDateRange((prev) => ({ ...prev, to: date || dayjs() }))
                }
                onQuickSelect={handleQuickDateSelect}
                sx={{
                  alignSelf: 'flex-end',
                }}
              />
            </Stack>

            {/* Error Alert */}
            {hasError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {balanceError || statsError || callsError}
              </Alert>
            )}

            {/* Credits Balance */}
            <CreditsBalance
              data={creditBalance as unknown as UserInfoResult}
              loading={balanceLoading}
              onRefresh={refetchBalance}
            />

            {/* Usage Summary Cards */}
            <UsageSummary
              totalCredits={displayUsageStats.summary.totalCredits}
              totalTokens={displayUsageStats.summary.byType?.chatCompletion?.totalUsage}
              totalRequests={displayUsageStats.summary.totalCalls}
            />

            {/* Usage Charts */}
            <UsageCharts dailyStats={displayUsageStats.dailyStats} showCredits showTokens showRequests={false} />

            {/* Model Usage Stats */}
            <ModelUsageStats
              modelStats={displayUsageStats.modelStats}
              totalCredits={displayUsageStats.summary.totalCredits}
            />
            <Divider sx={{ my: 2 }} />
            {/* Call History */}
            <CallHistory
              calls={displayModelCalls}
              loading={callsLoading}
              onExport={handleExport}
              exportLoading={exportLoading}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          </Stack>
        </Container>
      </Box>
    </LocalizationProvider>
  );
}

export default CreditBoard;
