import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { Add, CreditCard } from '@mui/icons-material';
import { Button, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material';

interface CreditsBalanceProps {
  data?: UserInfoResult;
}

export function CreditsBalance({ data = undefined as UserInfoResult | undefined }: CreditsBalanceProps) {
  const { t } = useLocaleContext();
  const { creditBalance, paymentLink, enableCredit = false } = data || {};

  const overDue = Number(creditBalance?.pendingCredit) > 0;

  const renderBalance = () => {
    if (!enableCredit) {
      return (
        <Typography variant="h3" sx={{ fontWeight: 'bold', color: 'success.main' }}>
          {t('analytics.noLimit')}
        </Typography>
      );
    }
    if (overDue) {
      return (
        <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1, color: 'error.main' }}>
          - {formatNumber(creditBalance?.pendingCredit || 0)}
        </Typography>
      );
    }
    return (
      <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 1, color: 'text.primary' }}>
        {formatNumber(creditBalance?.balance || 0)}
      </Typography>
    );
  };

  return (
    <Card
      sx={{
        boxShadow: 1,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.default',
      }}>
      <CardHeader
        title={
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}>
            <CreditCard sx={{ fontSize: 20 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('analytics.creditsBalance')}
            </Typography>
          </Stack>
        }
        sx={{ pb: 1 }}
      />
      <CardContent sx={{ pt: 0 }}>
        {renderBalance()}
        {enableCredit && paymentLink && (
          <Button
            variant="contained"
            size="small"
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
        )}
      </CardContent>
    </Card>
  );
}
