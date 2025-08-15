import { getPrefix } from '@app/libs/util';
import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Avatar, Box, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material';
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

function getUsageDisplay(model: ModelStats): string {
  switch (model.type.toLowerCase()) {
    case 'imagegeneration':
      return `${formatNumber(model.totalUsage)} images`;
    case 'videogeneration':
      return `${formatNumber(model.totalUsage)} minutes`;
    case 'chatcompletion':
    case 'completion':
    case 'embedding':
    case 'transcription':
    case 'speech':
    case 'audiogeneration':
    default:
      return `${formatNumber(model.totalUsage)} tokens`;
  }
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

  const renderTooltipContent = (model: ModelStats) => {
    return (
      <Card sx={{ minWidth: 280, border: 'none', boxShadow: 'none' }}>
        <CardContent sx={{ p: 2 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              mb: 2,
            }}>
            <Avatar
              src={joinURL(getPrefix(), `/logo/${model.provider.name}.png`)}
              sx={{ width: 32, height: 32 }}
              alt={model.provider.displayName}
            />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                {model.model}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {model.provider?.displayName}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="column" spacing={1} sx={{ backgroundColor: 'grey.50', p: 2, borderRadius: 1 }}>
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {t('analytics.totalRequests')}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                {formatNumber(model.totalCalls)}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {t('analytics.totalCreditsUsed')}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                {formatNumber(model.totalCredits)}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {t('analytics.totalUsage')}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                {getUsageDisplay(model)}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  };

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
                      <Tooltip
                        title={renderTooltipContent(model)}
                        slotProps={{
                          tooltip: {
                            sx: {
                              maxWidth: 'none',
                              backgroundColor: 'background.paper',
                              boxShadow: 2,
                              p: 0,
                            },
                          },
                        }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'medium', cursor: 'help' }}>
                          {model.model}
                        </Typography>
                      </Tooltip>
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
