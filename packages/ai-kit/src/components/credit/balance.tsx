import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { AccountBalanceWalletRounded } from '@mui/icons-material';
import { Box, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { blue } from '@mui/material/colors';
import { useCallback, useEffect, useState } from 'react';

import { getCreditBalance } from '../../api/app';
import withLocaleProvider from '../../utils/withLocaleProvider';

interface CreditBalanceProps {
  balance?: number;
  currency?: string;
  useAIKitService?: boolean;
}

function CreditBalance({ balance = undefined, currency = undefined, useAIKitService = false }: CreditBalanceProps) {
  const { t } = useLocaleContext();
  const [creditData, setCreditData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getCreditBalance({ useAIKitService });
      // Safely access response data
      setCreditData(result);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      setError(err instanceof Error ? err.message : t('failedToLoadBalance'));
    } finally {
      setLoading(false);
    }
  }, [t, useAIKitService]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '120px',
            }}>
            <CircularProgress size={32} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography
            color="error"
            variant="body2"
            sx={{
              textAlign: 'center',
            }}>
            {error}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Use props or API data
  const displayBalance = balance ?? creditData?.balance ?? '0';
  const displayCurrency = currency ?? creditData?.currency ?? 'USD';

  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${blue[500]} 0%, ${blue[700]} 100%)`,
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}>
      <CardContent sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}>
            <AccountBalanceWalletRounded sx={{ fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              {t('creditBalance')}
            </Typography>
          </Stack>

          <Box>
            <Typography variant="h3" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
              {displayBalance}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5 }}>
              {displayCurrency}
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            {t('availableForUse')}
          </Typography>
        </Stack>
      </CardContent>
      {/* Background decoration */}
      <Box
        sx={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          zIndex: 0,
        }}
      />
    </Card>
  );
}

export default withLocaleProvider(CreditBalance, {
  translations: {
    en: {
      creditBalance: 'Credit Balance',
      availableForUse: 'Available for use',
      failedToLoadBalance: 'Failed to load balance',
    },
    zh: {
      creditBalance: '信用额度余额',
      availableForUse: '可用余额',
      failedToLoadBalance: '加载余额失败',
    },
  },
});
