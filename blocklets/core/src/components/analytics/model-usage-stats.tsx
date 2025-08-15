import { getPrefix } from '@app/libs/util';
import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Avatar, Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { joinURL } from 'ufo';

export interface ModelStats {
  providerId: string;
  provider: {
    id: string;
    name: string;
    displayName: string;
  };
  model: string;
  type: string;
  totalUsage: number;
  totalCalls: number;
  totalCredits: number;
  successRate: number;
}

interface ModelUsageStatsProps {
  modelStats?: ModelStats[];
  totalModelCount?: number;
  title?: string;
  subtitle?: string;
  maxItems?: number;
}

export function ModelUsageStats({
  modelStats = [],
  totalModelCount = undefined,
  title = undefined,
  subtitle = undefined,
  maxItems = undefined,
}: ModelUsageStatsProps) {
  const { t } = useLocaleContext();

  const displayStats = maxItems ? modelStats.slice(0, maxItems) : modelStats;

  const content = (
    <>
      {title && (
        <Box sx={{ mb: { xs: 2, sm: 3 } }}>
          <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body1"
              sx={{
                color: 'text.secondary',
                mb: 1,
              }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      )}

      {!modelStats.length ? (
        <Empty>{t('analytics.modelUsageStatsEmpty')}</Empty>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Stack spacing={1.5} sx={{ flex: 1, mb: 2 }}>
            {displayStats.map((model, index) => {
              return (
                <Stack
                  key={`${model.providerId}-${model.model}`}
                  direction="row"
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1,
                  }}>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                      alignItems: 'center',
                      flex: 1,
                    }}>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 'bold',
                        color: 'text.secondary',
                        minWidth: 20,
                        p: 1,
                        textAlign: 'center',
                        backgroundColor: 'grey.100',
                        borderRadius: '50%',
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {index + 1}
                    </Typography>

                    {/* 头像 */}
                    <Avatar
                      src={joinURL(getPrefix(), `/logo/${model.provider.name}.png`)}
                      sx={{
                        width: 24,
                        height: 24,
                      }}
                      alt={model.provider.displayName}
                    />

                    {/* 模型名 */}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                        {model.model}
                      </Typography>
                    </Box>
                  </Stack>

                  {/* 调用次数 */}
                  <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                    {formatNumber(model.totalCalls)} calls
                  </Typography>
                </Stack>
              );
            })}
          </Stack>

          {/* 底部统计信息 */}
          <Box
            sx={{
              mt: 'auto',
              pt: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
            }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
              }}>
              {t('analytics.modelUsageStatsTotal', { total: totalModelCount })}
            </Typography>
          </Box>
        </Box>
      )}
    </>
  );

  return (
    <Card
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        boxShadow: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
      }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{content}</CardContent>
    </Card>
  );
}
