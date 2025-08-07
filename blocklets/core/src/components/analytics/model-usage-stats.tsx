import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { AudioFile, Code, Image, Psychology, SmartToy, TextFields } from '@mui/icons-material';
import { Box, Card, CardContent, CardHeader, Chip, LinearProgress, Stack, Typography } from '@mui/material';

export interface ModelStats {
  providerId: string;
  model: string;
  type: string;
  totalUsage: number;
  totalCredits: number;
  totalCalls: number;
  successRate: number;
}

interface ModelUsageStatsProps {
  modelStats?: ModelStats[];
  totalCredits?: number;
  title?: string;
  subtitle?: string;
  showSuccessRate?: boolean;
  maxItems?: number;
  useCard?: boolean;
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

function getProviderColor(providerId: string) {
  const colors: Record<string, string> = {
    openai: '#10A37F',
    anthropic: '#D97706',
    google: '#4285F4',
    bedrock: '#FF9900',
    ollama: '#000000',
    deepseek: '#1E88E5',
    xai: '#FF6B35',
  };
  return colors[providerId.toLowerCase()] || '#1976d2';
}

export function ModelUsageStats({
  modelStats = [],
  totalCredits = 1,
  title = undefined,
  subtitle = undefined,
  showSuccessRate = true,
  maxItems = undefined,
  useCard = false,
}: ModelUsageStatsProps) {
  const { t } = useLocaleContext();

  const displayStats = maxItems ? modelStats.slice(0, maxItems) : modelStats;

  const content = (
    <>
      {title && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 'medium' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
          {maxItems && modelStats.length > maxItems && (
            <Typography variant="caption" color="text.secondary">
              {t('showing')} {maxItems} {t('of')} {modelStats.length}
            </Typography>
          )}
        </Box>
      )}

      {!modelStats.length ? (
        <Empty title={title || t('analytics.modelUsageStats')} />
      ) : (
        <Stack spacing={3}>
          {displayStats.map((model, index) => {
            const percentage = (model.totalCredits / totalCredits) * 100;
            const icon = getModelIcon(model.type, model.model);
            const providerColor = getProviderColor(model.providerId);

            return (
              <Box key={`${model.providerId}-${model.model}-${index}`}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ color: providerColor }}>{icon}</Box>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                        {model.model}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {model.providerId}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${model.totalCalls} ${t('requests')}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        borderColor: providerColor,
                        color: providerColor,
                      }}
                    />
                  </Stack>
                  <Box textAlign="right">
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                      {model.totalCredits.toLocaleString()} {t('credits')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {model.type === 'imageGeneration'
                        ? `${model.totalUsage} ${t('images')}`
                        : `${(model.totalUsage / 1000).toFixed(1)}K ${t('tokens')}`}
                    </Typography>
                  </Box>
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={Math.min(percentage, 100)}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: providerColor,
                    },
                  }}
                />

                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {percentage.toFixed(1)}% {t('ofTotalUsage')}
                  </Typography>
                  {showSuccessRate && (
                    <Typography variant="caption" color="success.main">
                      {model.successRate.toFixed(1)}% {t('successRate')}
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </>
  );

  if (useCard) {
    return (
      <Card sx={{ boxShadow: 1, borderColor: 'divider' }}>
        <CardHeader
          title={title || t('analytics.modelUsageStats')}
          subheader={subtitle || t('analytics.modelUsageStatsDescription')}
          action={
            maxItems && modelStats.length > maxItems ? (
              <Typography variant="caption" color="text.secondary">
                {t('showing')} {maxItems} {t('of')} {modelStats.length}
              </Typography>
            ) : null
          }
        />
        <CardContent>
          {!modelStats.length ? (
            <Empty title={title || t('analytics.modelUsageStats')} />
          ) : (
            <Stack spacing={3}>
              {displayStats.map((model, index) => {
                const percentage = (model.totalCredits / totalCredits) * 100;
                const icon = getModelIcon(model.type, model.model);
                const providerColor = getProviderColor(model.providerId);

                return (
                  <Box key={`${model.providerId}-${model.model}-${index}`}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Box sx={{ color: providerColor }}>{icon}</Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                            {model.model}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {model.providerId}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${model.totalCalls} ${t('requests')}`}
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: providerColor,
                            color: providerColor,
                          }}
                        />
                      </Stack>
                      <Box textAlign="right">
                        <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                          {model.totalCredits.toLocaleString()} {t('credits')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {model.type === 'imageGeneration'
                            ? `${model.totalUsage} ${t('images')}`
                            : `${(model.totalUsage / 1000).toFixed(1)}K ${t('tokens')}`}
                        </Typography>
                      </Box>
                    </Stack>

                    <LinearProgress
                      variant="determinate"
                      value={Math.min(percentage, 100)}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: providerColor,
                        },
                      }}
                    />

                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {percentage.toFixed(1)}% {t('ofTotalUsage')}
                      </Typography>
                      {showSuccessRate && (
                        <Typography variant="caption" color="success.main">
                          {model.successRate.toFixed(1)}% {t('successRate')}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>
    );
  }

  return <Box>{content}</Box>;
}
