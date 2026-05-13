import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Card, CardContent, CardHeader, Typography, useTheme } from '@mui/material';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { ModelDistribution as ModelDistributionType } from '../../../customer/hooks';

interface ModelDistributionProps {
  modelDistribution?: ModelDistributionType[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
}

function CustomTooltip({ active = false, payload = [] }: CustomTooltipProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();

  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '8px',
        boxShadow: theme.shadows[8],
        padding: '12px 16px',
        minWidth: '180px',
      }}>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
        {data.model}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('analytics.totalRequests')}: {formatNumber(data.calls, 0, true)}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {data.percentage.toFixed(1)}%
      </Typography>
    </div>
  );
}

const COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f97316', // orange
  '#10b981', // green
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#6366f1', // indigo
];

export function ModelDistribution({ modelDistribution = [] }: ModelDistributionProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();

  // 只显示前8个模型
  const topModels = modelDistribution.slice(0, 8);
  const chartData: Array<Record<string, number | string>> = topModels.map((item) => ({ ...item }));

  return (
    <Card
      sx={{
        boxShadow: 'none',
        border: '1px solid',
        borderColor: 'divider',
        height: '100%',
        backgroundColor: 'background.default',
      }}>
      <CardHeader
        title={
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('analytics.modelDistribution')}
          </Typography>
        }
      />
      <CardContent sx={{ height: 350, pt: 0 }}>
        {topModels && topModels.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={({ payload }: any) =>
                  typeof payload?.percentage === 'number' ? `${payload.percentage.toFixed(0)}%` : ''
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="calls">
                {topModels.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                formatter={(value, entry: any) => (
                  <span style={{ color: theme.palette.text.primary }}>
                    {value} ({entry.payload.percentage.toFixed(1)}%)
                  </span>
                )}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <Empty>{t('analytics.noModelData')}</Empty>
        )}
      </CardContent>
    </Card>
  );
}
