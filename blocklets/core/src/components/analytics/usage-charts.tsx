import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Card, CardContent, CardHeader, useTheme } from '@mui/material';
import dayjs from 'dayjs';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

export interface UsageByType {
  [key: string]: {
    totalUsage: number;
    totalCalls: number;
  };
}

// New data format
export interface DailyStats {
  date: string;
  byType: UsageByType;
  totalCredits: number;
  totalCalls: number;
  totalUsage: number;
}

// Legacy data format for backward compatibility
export interface LegacyDailyStats {
  date: string;
  credits: number;
  tokens: number;
  requests: number;
}

export interface UsageChartsProps {
  dailyStats?: (DailyStats | LegacyDailyStats)[];
  title?: string;
  height?: number;
  // Legacy props for backward compatibility
  showCredits?: boolean;
  showRequests?: boolean;
}

// Function to get usage unit based on service type
const getUsageUnit = (type: string, t: any) => {
  const normalizedType = type.toLowerCase();
  switch (normalizedType) {
    case 'chatcompletion':
    case 'completion':
    case 'embedding':
    case 'transcription':
    case 'speech':
    case 'audiogeneration':
      return t('modelUnits.tokens');
    case 'imagegeneration':
      return t('modelUnits.images');
    case 'videogeneration':
      return t('modelUnits.minutes');
    default:
      return t('modelUnits.tokens');
  }
};

// Function to get display name for service type
const getServiceTypeDisplayName = (type: string, t: any) => {
  const typeKey = `modelTypes.${type}`;
  try {
    return t(typeKey);
  } catch {
    return type;
  }
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  showCredits: boolean;
  showRequests: boolean;
  theme: any;
  t: any;
}

function CustomTooltip({
  active = false,
  payload = [],
  label = '',
  showCredits,
  showRequests,
  theme,
  t,
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload as DailyStats;

  const formatDateLabel = (label: string) => {
    return dayjs(label).format('YYYY-MM-DD');
  };

  const tooltipStyle = {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '12px',
    boxShadow: theme.shadows[8],
    minWidth: '240px',
    maxWidth: '320px',
    color: theme.palette.text.primary,
    padding: 0,
  };

  return (
    <div style={tooltipStyle}>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 12px 20px',
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[50],
          borderRadius: '12px 12px 0 0',
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: theme.palette.text.primary,
            }}>
            {formatDateLabel(label!)}
          </span>
        </div>
      </div>

      {/* Main Stats */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {showCredits ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '3px',
                    borderRadius: '2px',
                    backgroundColor: theme.palette.primary.main,
                  }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    color: theme.palette.text.primary,
                    fontWeight: 500,
                  }}>
                  {t('analytics.totalCreditsUsed')}
                </span>
              </div>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                }}>
                {formatNumber(data.totalCredits)}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '3px',
                    borderRadius: '2px',
                    backgroundColor: theme.palette.text.primary,
                  }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    color: theme.palette.text.primary,
                    fontWeight: 500,
                  }}>
                  {t('analytics.totalUsage')}
                </span>
              </div>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                }}>
                {formatNumber(data.totalUsage)}
              </span>
            </div>
          )}

          {showRequests && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '14px',
                  color: theme.palette.text.primary,
                  fontWeight: 500,
                }}>
                {t('analytics.totalRequests')}
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                }}>
                {formatNumber(data.totalCalls)}
              </span>
            </div>
          )}
        </div>

        {/* Model Details */}
        {data.byType && Object.keys(data.byType).length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div
              style={{
                borderTop: `1px solid ${theme.palette.divider}`,
                paddingTop: '16px',
              }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                  marginBottom: '12px',
                }}>
                {t('analytics.modelUsageStats')}:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(data.byType).map(([type, stats]) => {
                  const unit = getUsageUnit(type, t);
                  const displayName = getServiceTypeDisplayName(type, t);
                  return (
                    <div
                      key={type}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 12px',
                        backgroundColor: theme.palette.grey[100],
                        borderRadius: '6px',
                      }}>
                      <span
                        style={{
                          fontSize: '12px',
                          color: theme.palette.text.secondary,
                          fontWeight: 500,
                        }}>
                        {displayName}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: theme.palette.text.primary,
                          fontWeight: 600,
                        }}>
                        {formatNumber(stats.totalUsage)} {unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UsageCharts({
  dailyStats = [],
  title = '',
  height = 220,
  showCredits = true,
  showRequests = false,
}: UsageChartsProps) {
  const { t, locale } = useLocaleContext();
  const theme = useTheme();

  const formatXAxisLabel = (label: string) => {
    if (locale === 'zh') {
      return dayjs(label).format('M月D日');
    }
    return dayjs(label).format('MMM DD');
  };

  const cardStyles = {
    boxShadow: 1,
    border: '1px solid',
    borderColor: 'divider',
    height: '100%',
    backgroundColor: 'background.default',
  };

  const chartTitle = title || (showCredits ? t('analytics.dailyCreditsUsage') : t('analytics.dailyUsage'));

  const chartContent = (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={dailyStats} margin={{ right: 30, left: 20, top: 10 }}>
        <Tooltip
          content={<CustomTooltip showCredits={showCredits} showRequests={showRequests} theme={theme} t={t} />}
        />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => formatXAxisLabel(value)}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
          padding={{ left: 10, right: 10 }}
        />
        <Line
          type="monotone"
          dataKey={showCredits ? 'totalCredits' : 'totalUsage'}
          stroke={theme.palette.primary.main}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <Card sx={cardStyles}>
      <CardHeader title={chartTitle} />
      {dailyStats && dailyStats.length > 0 ? (
        <CardContent
          sx={{
            height,
            px: 0,
            svg: {
              outline: 'none',
            },
          }}>
          {chartContent}
        </CardContent>
      ) : (
        <CardContent
          sx={{
            height,
            px: 0,
          }}>
          <Empty>{t('analytics.dailyUsageEmpty')}</Empty>
        </CardContent>
      )}
    </Card>
  );
}
