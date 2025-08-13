import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AudioFile, Code, Image, Psychology, SmartToy, TextFields } from '@mui/icons-material';
import { Box, Card, CardContent, LinearProgress, Stack, Tooltip, Typography, useTheme } from '@mui/material';

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
  totalCalls?: number;
  title?: string;
  subtitle?: string;
  maxItems?: number;
}

function getModelIcon(type: string, model: string) {
  if (type === 'imageGeneration' || model.toLowerCase().includes('dall')) {
    return <Image />;
  }
  if (type === 'embedding' || model.toLowerCase().includes('embedding')) {
    return <TextFields />;
  }
  if (type === 'audioTranscription' || model.toLowerCase().includes('whisper')) {
    return <AudioFile />;
  }
  if (model.toLowerCase().includes('code') || model.toLowerCase().includes('codex')) {
    return <Code />;
  }
  if (model.toLowerCase().includes('claude')) {
    return <Psychology />;
  }
  return <SmartToy />;
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
  totalCalls = 1,
  title = undefined,
  subtitle = undefined,
  maxItems = undefined,
}: ModelUsageStatsProps) {
  const { t } = useLocaleContext();
  const theme = useTheme();

  const displayStats = maxItems ? modelStats.slice(0, maxItems) : modelStats;
  const color = theme.palette.primary.main;

  const renderTooltipContent = (model: ModelStats) => {
    const icon = getModelIcon(model.type, model.model);
    return (
      <Card sx={{ minWidth: 280, border: 'none', boxShadow: 'none' }}>
        <CardContent sx={{ p: 2 }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: 'center',
              mb: 2,
            }}>
            <Box
              sx={{
                color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 1,
                backgroundColor: `${color}15`,
              }}>
              {icon}
            </Box>
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
        <Stack
          spacing={0}
          divider={<Box sx={{ height: 1, backgroundColor: 'divider', mx: { xs: 1, sm: 2 } }} />}
          sx={{ gap: 1.5 }}>
          {displayStats.map((model) => {
            const percentage = (model.totalCalls / totalCalls) * 100;
            const icon = getModelIcon(model.type, model.model);
            return (
              <Box>
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: { xs: 1, sm: 1.5 },
                  }}>
                  <Stack
                    direction="row"
                    spacing={{ xs: 1.5, sm: 2 }}
                    sx={{
                      alignItems: 'center',
                    }}>
                    <Box
                      sx={{
                        color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: { xs: 20, sm: 24 },
                        height: { xs: 20, sm: 24 },
                        borderRadius: 1,
                        backgroundColor: `${color}15`,
                      }}>
                      {icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Tooltip
                        key={`${model.providerId}-${model.model}`}
                        title={renderTooltipContent(model)}
                        slotProps={{
                          tooltip: {
                            sx: {
                              maxWidth: 'none',
                              backgroundColor: 'background.paper',
                              boxShadow: 2,
                            },
                          },
                        }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                          {model.model}
                        </Typography>
                      </Tooltip>
                    </Box>
                  </Stack>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                    {percentage.toFixed(0)}%
                  </Typography>
                </Stack>
                <Box sx={{ mb: { xs: 0.5, sm: 1 } }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(percentage, 100)}
                    sx={{
                      height: { xs: 4, sm: 6 },
                      borderRadius: 3,
                      backgroundColor: 'grey.200',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: color,
                        borderRadius: 3,
                      },
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Stack>
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
