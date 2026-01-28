import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Table } from '@blocklet/aigne-hub/components';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Avatar, Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import dayjs from '../../libs/dayjs';
import { useUsageProjects } from '../../pages/customer/hooks';
import type { ProjectGroupedTrend, ProjectTrendSummary } from '../../pages/customer/hooks';
import { DateRangePicker } from './date-range-picker';
import { toUTCTimestamp } from './skeleton';

export interface Project {
  appDid: string | null;
  appName?: string;
  appLogo?: string;
  appUrl?: string;
  totalCalls: number;
  totalCredits: number;
  avgDuration?: number;
  successRate: number;
  lastCallTime: number;
}

export interface ProjectListProps {
  dateRange?: { start: dayjs.Dayjs; end: dayjs.Dayjs };
  onDateRangeChange?: (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => void;
  projectPathBase?: string;
  onProjectSelect?: (appDid: string) => void;
  allUsers?: boolean;
  dataSource?: 'projects' | 'trends';
  trendsData?: {
    projects: ProjectTrendSummary[];
    trends: ProjectGroupedTrend[];
    granularity: 'hour' | 'day';
  };
  trendsLoading?: boolean;
}

const getProjectKey = (appDid: string | null) => appDid ?? 'null';

export function ProjectList({
  dateRange: externalDateRange,
  onDateRangeChange,
  projectPathBase,
  onProjectSelect,
  allUsers = false,
  dataSource = undefined,
  trendsData,
  trendsLoading: externalTrendsLoading,
}: ProjectListProps = {}) {
  const { t, locale } = useLocaleContext();
  const navigate = useNavigate();
  const theme = useTheme();
  const creditPrefix = window.blocklet?.preferences?.creditPrefix || '';
  const unknownProjectLabel = t('analytics.unknownProject');
  const [internalDateRange, setInternalDateRange] = useState(() => ({
    start: dayjs().subtract(6, 'day'),
    end: dayjs(),
  }));
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const basePath = (projectPathBase || '/usage/projects').replace(/\/$/, '');
  const resolvedDataSource = dataSource || (allUsers ? 'projects' : 'trends');
  const useTrends = resolvedDataSource === 'trends';
  const slowThresholdSeconds = 30;
  const verySlowThresholdSeconds = slowThresholdSeconds * 2;

  // Use external date range if provided, otherwise use internal
  const dateRange = externalDateRange || internalDateRange;
  const setDateRange = onDateRangeChange || setInternalDateRange;

  const rangeStart = dateRange.start.startOf('day');
  const rangeEnd = dateRange.end.endOf('day');
  const rangeFrom = toUTCTimestamp(rangeStart);
  const rangeTo = toUTCTimestamp(rangeEnd, true);
  const timezoneOffset = new Date().getTimezoneOffset();

  const { data: usageProjects, loading: projectsLoading } = useUsageProjects({
    startTime: rangeFrom,
    endTime: rangeTo,
    page: page + 1, // API uses 1-based pagination, Table uses 0-based
    pageSize,
    sortBy: 'totalCalls',
    sortOrder: 'desc',
    allUsers,
    timezoneOffset,
    enabled: !useTrends,
  });
  const resolvedTrendsData = trendsData;
  const resolvedTrendsLoading = externalTrendsLoading ?? false;

  const projects: Project[] = useMemo(() => {
    if (!useTrends) {
      return (usageProjects?.projects as Project[]) || [];
    }

    const projectsMap = new Map<
      string,
      {
        appDid: string | null;
        appName?: string;
        appLogo?: string;
        appUrl?: string;
        totalCalls: number;
        totalCredits: number;
        totalUsage: number;
        successCalls: number;
        totalDuration: number;
        lastCallTime: number;
      }
    >();

    (resolvedTrendsData?.projects || []).forEach((project) => {
      const key = getProjectKey(project.appDid);
      projectsMap.set(key, {
        appDid: project.appDid ?? null,
        appName: project.appName,
        appLogo: project.appLogo,
        appUrl: project.appUrl,
        totalCalls: 0,
        totalCredits: 0,
        totalUsage: 0,
        successCalls: 0,
        totalDuration: 0,
        lastCallTime: project.lastCallTime || 0,
      });
    });

    (resolvedTrendsData?.trends || []).forEach((trend) => {
      Object.entries(trend.byProject || {}).forEach(([key, stats]) => {
        const entry = projectsMap.get(key) || {
          appDid: key === 'null' ? null : key,
          appName: key,
          totalCalls: 0,
          totalCredits: 0,
          totalUsage: 0,
          successCalls: 0,
          totalDuration: 0,
          lastCallTime: 0,
        };

        entry.totalCalls += stats.totalCalls || 0;
        entry.totalCredits += stats.totalCredits || 0;
        entry.totalUsage += stats.totalUsage || 0;
        entry.successCalls += stats.successCalls || 0;
        entry.totalDuration += (stats.avgDuration || 0) * (stats.successCalls || 0);
        if ((stats.totalCalls || 0) > 0) {
          entry.lastCallTime = Math.max(entry.lastCallTime || 0, trend.timestamp);
        }

        projectsMap.set(key, entry);
      });
    });

    return Array.from(projectsMap.values())
      .map((entry) => ({
        appDid: entry.appDid ?? null,
        appName: entry.appName,
        appLogo: entry.appLogo,
        appUrl: entry.appUrl,
        totalCalls: entry.totalCalls,
        totalCredits: entry.totalCredits,
        avgDuration: entry.successCalls > 0 ? Math.round((entry.totalDuration / entry.successCalls) * 10) / 10 : 0,
        successRate: entry.totalCalls > 0 ? (entry.successCalls / entry.totalCalls) * 100 : 0,
        lastCallTime: entry.lastCallTime,
      }))
      .sort((a, b) => (b.totalCalls || 0) - (a.totalCalls || 0));
  }, [resolvedTrendsData, usageProjects, useTrends]);

  const total = useTrends ? projects.length : usageProjects?.total || 0;
  const loading = useTrends ? resolvedTrendsLoading : projectsLoading;

  const formatLastCallTime = (timestamp: number) => {
    if (!timestamp) return '-';
    const date = dayjs.unix(timestamp);
    return date.locale(locale).fromNow();
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    return `${Number(seconds).toFixed(1)}s`;
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return '#4caf50'; // success green
    if (rate >= 70) return '#ff9800'; // warning orange
    return '#f44336'; // error red
  };
  const getAvgDurationColor = (duration?: number) => {
    if (duration === undefined || duration === null) return theme.palette.text.secondary;
    if (duration >= verySlowThresholdSeconds) return theme.palette.error.main;
    if (duration >= slowThresholdSeconds) return theme.palette.warning.main;
    return theme.palette.text.primary;
  };

  const truncateAppDid = (appDid: string | null) => {
    if (!appDid || appDid.length <= 32) return appDid || '';
    return `${appDid.slice(0, 16)}...${appDid.slice(-12)}`;
  };

  const handleViewProject = (appDid: string | null) => {
    if (!appDid) return;
    navigate(`${basePath}/${encodeURIComponent(appDid)}`);
  };

  const handleSelectProject = (appDid: string | null) => {
    if (!appDid) return;
    if (onProjectSelect) {
      onProjectSelect(appDid);
      return;
    }
    handleViewProject(appDid);
  };

  const columns = [
    {
      name: 'appDid',
      label: t('analytics.projectId'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const project = projects[tableMeta.rowIndex];
          if (!project) return null;
          const displayName = project.appName || truncateAppDid(project.appDid) || unknownProjectLabel;
          const tooltipText =
            project.appDid && project.appName && project.appName !== project.appDid ? project.appDid : '';
          const avatarSrc = project.appUrl && project.appLogo ? `${project.appUrl}${project.appLogo}` : undefined;
          return (
            <Tooltip title={tooltipText} placement="top">
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ cursor: 'pointer' }}>
                <Avatar src={avatarSrc} sx={{ width: 32, height: 32 }} variant="rounded">
                  {displayName.charAt(0).toUpperCase()}
                </Avatar>
                <Typography
                  variant="body2"
                  sx={{
                    maxWidth: 280,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}>
                  {displayName}
                </Typography>
              </Stack>
            </Tooltip>
          );
        },
      },
    },
    {
      name: 'totalCalls',
      label: t('analytics.totalRequests'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const project = projects[tableMeta.rowIndex];
          if (!project) return null;
          return <Typography variant="body2">{formatNumber(project.totalCalls, 0, true)}</Typography>;
        },
      },
    },
    {
      name: 'totalCredits',
      label: t('analytics.totalCreditsUsed'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const project = projects[tableMeta.rowIndex];
          if (!project) return null;
          return (
            <Typography variant="body2">
              {creditPrefix}
              {formatNumber(project.totalCredits)}
            </Typography>
          );
        },
      },
    },
    {
      name: 'avgDuration',
      label: t('analytics.avgDuration'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const project = projects[tableMeta.rowIndex];
          if (!project) return null;
          return (
            <Typography variant="body2" sx={{ color: getAvgDurationColor(project.avgDuration) }}>
              {formatDuration(project.avgDuration)}
            </Typography>
          );
        },
      },
    },
    {
      name: 'successRate',
      label: t('successRate'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const project = projects[tableMeta.rowIndex];
          if (!project) return null;
          return (
            <Typography
              variant="body2"
              sx={{
                color: getSuccessRateColor(project.successRate),
                fontWeight: 500,
              }}>
              {project.successRate.toFixed(1)}%
            </Typography>
          );
        },
      },
    },
    {
      name: 'lastCallTime',
      label: t('analytics.lastCalled'),
      align: 'right',
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const project = projects[tableMeta.rowIndex];
          if (!project) return null;
          return (
            <Typography variant="body2" color="text.secondary">
              {formatLastCallTime(project.lastCallTime)}
            </Typography>
          );
        },
      },
    },
  ];

  const renderEmptyState = () => {
    return (
      <Stack spacing={1} sx={{ py: 4, alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('analytics.noProjects')}
        </Typography>
      </Stack>
    );
  };

  const tableOptions = useMemo(() => {
    if (useTrends) {
      return {
        pagination: false,
        serverSide: false,
        search: false,
        download: false,
        print: false,
        viewColumns: false,
        filter: false,
        selectableRows: 'none',
        responsive: 'vertical' as const,
        onRowClick: (_rowData: any, rowMeta: any) => {
          const project = projects[rowMeta.dataIndex];
          if (project) {
            handleSelectProject(project.appDid);
          }
        },
      };
    }

    return {
      count: total,
      page,
      rowsPerPage: pageSize,
      pagination: true,
      serverSide: true,
      search: false,
      download: false,
      print: false,
      viewColumns: false,
      filter: false,
      selectableRows: 'none',
      responsive: 'vertical' as const,
      onChangePage: (newPage: number) => {
        setPage(newPage);
      },
      onChangeRowsPerPage: (newPageSize: number) => {
        setPageSize(newPageSize);
        setPage(0);
      },
      onRowClick: (_rowData: any, rowMeta: any) => {
        const project = projects[rowMeta.dataIndex];
        if (project) {
          handleSelectProject(project.appDid);
        }
      },
    };
  }, [handleSelectProject, page, pageSize, projects, total, useTrends]);

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
        }}>
        <Stack>
          <Typography variant="h3">{t('analytics.projects')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('analytics.projectsDescription')}
          </Typography>
        </Stack>
        <DateRangePicker
          startDate={dateRange.start}
          endDate={dateRange.end}
          onStartDateChange={(date) => setDateRange({ start: date || dayjs(), end: dateRange.end })}
          onEndDateChange={(date) => setDateRange({ start: dateRange.start, end: date || dayjs() })}
          onQuickSelect={(range) => setDateRange({ start: range.start, end: range.end })}
          sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}
        />
      </Stack>
      <Box>
        <Table
          data={projects}
          columns={columns}
          loading={loading}
          options={tableOptions}
          emptyNodeText={renderEmptyState()}
          mobileTDFlexDirection="row"
        />
      </Box>
    </Stack>
  );
}
