import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Add, CreditCard, Refresh } from '@mui/icons-material';
import { Button, Card, CardContent, CardHeader, CircularProgress, IconButton, Stack, Typography } from '@mui/material';

interface CreditsBalanceProps {
  data?: UserInfoResult;
  loading?: boolean;
  onRefresh?: () => void;
}

export function CreditsBalance({
  data = undefined as UserInfoResult | undefined,
  loading = false,
  onRefresh = () => {},
}: CreditsBalanceProps) {
  const { t } = useLocaleContext();
  const { creditBalance, paymentLink } = data || {};

  const overDue = Number(creditBalance?.pendingCredit) > 0;
  return (
    <Card sx={{ boxShadow: 1, borderColor: 'divider' }}>
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            <CreditCard sx={{ fontSize: 20 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('analytics.creditsBalance')}
            </Typography>
          </Stack>
        }
        action={
          <IconButton
            onClick={onRefresh}
            disabled={loading}
            size="small"
            sx={{
              '&:hover': { color: 'primary.main' },
              transition: 'color 0.2s ease',
            }}>
            <Refresh />
          </IconButton>
        }
        sx={{ pb: 1 }}
      />
      <CardContent sx={{ pt: 0 }}>
        <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1, color: overDue ? 'error.main' : 'primary.main' }}>
          {loading ? (
            <CircularProgress size={32} />
          ) : overDue ? (
            `- ${formatNumber(creditBalance?.pendingCredit || 0)}`
          ) : (
            formatNumber(creditBalance?.balance || 0)
          )}
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => {
            if (paymentLink) {
              window.open(paymentLink, '_blank');
            }
          }}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
          }}>
          {t('analytics.addCredits')}
        </Button>
      </CardContent>
    </Card>
  );
}
