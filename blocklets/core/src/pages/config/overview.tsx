import { getObservabilityBlocklet, getObservabilityUrl } from '@app/libs/env';
import { getPrefix } from '@app/libs/util';
import Dialog from '@arcblock/ux/lib/Dialog';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { AnalyticsOutlined, CreditCard, SmartToyOutlined } from '@mui/icons-material';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinURL } from 'ufo';

export default function Overview() {
  const { t } = useLocaleContext();
  const navigate = useNavigate();
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);

  const observabilityBlocklet = getObservabilityBlocklet();

  const basicFeatures: {
    title: string;
    description: string;
    icon: React.ReactNode;
    path: string;
    external?: boolean;
    showDialog?: boolean;
    credit?: boolean;
  }[] = [
    {
      title: 'aiProviderSettings',
      description: 'aiProviderSettingsDesc',
      icon: <SmartToyOutlined sx={{ fontSize: 32, color: (theme) => theme.palette.grey[400] }} />,
      path: '/config/ai-config/providers',
    },
    {
      title: 'enableCredits',
      description: 'enableCreditsDesc',
      icon: <CreditCard sx={{ fontSize: 32, color: (theme) => theme.palette.grey[400] }} />,
      path: '/.well-known/service/admin/overview/components',
      external: true,
      showDialog: true,
      credit: true,
    },
  ];

  if (observabilityBlocklet) {
    basicFeatures.push({
      title: 'usageAnalytics',
      description: 'usageAnalyticsDesc',
      icon: <AnalyticsOutlined sx={{ fontSize: 32, color: (theme) => theme.palette.grey[400] }} />,
      path: getObservabilityUrl(),
      external: true,
    });
  }

  const handleClick = (item: any) => {
    if (item.showDialog) {
      setCreditsDialogOpen(true);
    } else if (item.external) {
      window.open(item.path, '_blank');
    } else if (item.path) {
      navigate(item.path);
    }
  };

  const handleConfigureCredits = () => {
    setCreditsDialogOpen(false);
    window.open('/.well-known/service/admin/overview/components', '_blank');
  };

  return (
    <Box>
      <Box
        sx={{
          mb: 4,
        }}>
        <Typography
          variant="h2"
          gutterBottom
          sx={{
            fontWeight: 'bold',
            mb: 1,
          }}>
          {t('welcome')}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            mb: 2,
          }}>
          {t('welcomeDesc')}
        </Typography>
      </Box>
      <Grid
        container
        spacing={2}
        sx={{
          mb: 4,
          maxWidth: 1200,
        }}>
        {basicFeatures.map((item) => (
          <Grid
            key={item.path}
            size={{
              xs: 12,
              sm: 6,
              md: 4,
            }}>
            <Box
              onClick={() => {
                if (item.credit && window.blocklet?.preferences?.creditBasedBillingEnabled) {
                  navigate('/config/ai-config/models');
                  return;
                }
                handleClick(item);
              }}
              sx={{
                height: '100%',
                cursor: 'pointer',
                padding: '20px',
                borderRadius: (theme) => `${1.5 * (theme.shape.borderRadius as number)}px`,
                background: (theme) => theme.palette.background.default,
                border: '1px solid',
                borderColor: (theme) => theme.palette.divider,
                boxShadow: (theme) => theme.shadows[1],
                '&:hover': {
                  boxShadow: 2,
                },
              }}>
              <Box
                sx={{
                  mb: 1,
                }}>
                {item.icon}
                <Typography
                  variant="h4"
                  sx={{
                    mt: 1.5,
                  }}>
                  {item.credit && window.blocklet?.preferences?.creditBasedBillingEnabled
                    ? t('configCredits')
                    : t(item.title)}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}>
                {t(item.description)}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Credits Configuration Dialog */}
      <Dialog
        open={creditsDialogOpen}
        onClose={() => setCreditsDialogOpen(false)}
        maxWidth="md"
        fullWidth
        actions={
          <Stack direction="row" spacing={2}>
            <Button onClick={() => setCreditsDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleConfigureCredits} variant="contained">
              {t('gotoConfig')}
            </Button>
          </Stack>
        }
        title={window.blocklet?.preferences?.creditBasedBillingEnabled ? t('configCredits') : t('enableCredits')}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {t('creditsConfigDesc')}
          </Typography>
          <Box
            sx={{
              mb: 3,
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}>
            <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
              {t('installPaymentKit')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('installPaymentKitDesc')}
            </Typography>
          </Box>
          <Box
            sx={{
              mb: 3,
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}>
            <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
              {t('updatePreferences')}
            </Typography>
            <Box
              component="img"
              src={joinURL(getPrefix(), '/credit-config/step.png')}
              alt="Credits configuration steps"
              sx={{
                width: '100%',
                height: 'auto',
              }}
            />
          </Box>
          <Box
            sx={{
              mb: 3,
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}>
            <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
              {t('configModelRates')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('configModelRatesDesc')}
            </Typography>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
