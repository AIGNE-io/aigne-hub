import { getPaymentUrl } from '@app/libs/env';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AutoTopup, PaymentProvider, SafeGuard } from '@blocklet/payment-react';
import { Add, CreditCard, Receipt } from '@mui/icons-material';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  Typography,
  alpha,
  keyframes,
  useTheme,
} from '@mui/material';

import { useSessionContext } from '../../contexts/session';

// 水波动画 - 使用白色圆球左右移动模拟波浪
const waveMove1 = keyframes`
  0% {
    transform: translateX(-10px);
  }
  50% {
    transform: translateX(10px);
  }
  100% {
    transform: translateX(-10px);
  }
`;

const waveMove2 = keyframes`
  0% {
    transform: translateX(8px);
  }
  50% {
    transform: translateX(-8px);
  }
  100% {
    transform: translateX(8px);
  }
`;

const waveMove3 = keyframes`
  0% {
    transform: translateX(-6px);
  }
  50% {
    transform: translateX(6px);
  }
  100% {
    transform: translateX(-6px);
  }
`;

function WaveChart({ percentage }: { percentage: number }) {
  const theme = useTheme();
  const fillHeight = percentage;

  const getGradient = () => {
    if (percentage <= 10) {
      return `linear-gradient(180deg, 
        ${alpha(theme.palette.error.light, 0.2)} 0%, 
        ${alpha(theme.palette.error.light, 0.35)} 30%, 
        ${alpha(theme.palette.error.main, 0.45)} 70%, 
        ${alpha(theme.palette.error.main, 0.55)} 100%)`;
    }
    if (percentage <= 30) {
      return `linear-gradient(180deg, 
        ${alpha(theme.palette.warning.light, 0.2)} 0%, 
        ${alpha(theme.palette.warning.light, 0.35)} 30%, 
        ${alpha(theme.palette.warning.main, 0.45)} 70%, 
        ${alpha(theme.palette.warning.main, 0.55)} 100%)`;
    }
    return `linear-gradient(180deg, 
      ${alpha(theme.palette.success.light, 0.2)} 0%, 
      ${alpha(theme.palette.success.light, 0.35)} 30%, 
      ${alpha(theme.palette.success.main, 0.45)} 70%, 
      ${alpha(theme.palette.success.main, 0.55)} 100%)`;
  };

  const getBorderColor = () => {
    if (percentage === 0) return theme.palette.grey[100];
    if (percentage <= 10) return theme.palette.error.main;
    if (percentage <= 30) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  const getBgColor = () => {
    if (percentage === 0) return theme.palette.grey[300];
    if (percentage <= 10) return theme.palette.error.main;
    if (percentage <= 30) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  const getWaveOffset = () => {
    const waveTop = 80 - fillHeight * 0.8;
    return waveTop;
  };

  return (
    <Box
      sx={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: theme.palette.grey[50],
        border: `1px solid ${getBorderColor()}`,
        boxShadow: 1,
      }}>
      {/* 液体背景 */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: `${fillHeight}%`,
          background: getGradient(),
        }}
      />

      {/* 内部反射效果 */}
      {fillHeight > 20 && (
        <Box
          sx={{
            position: 'absolute',
            top: '10%',
            left: '15%',
            width: '25%',
            height: '30%',
            background: `linear-gradient(135deg, ${alpha('#ffffff', 0.4)} 0%, ${alpha('#ffffff', 0.1)} 50%, transparent 100%)`,
            borderRadius: '50%',
            filter: 'blur(2px)',
            opacity: 0.6,
          }}
        />
      )}

      {fillHeight > 5 && (
        <>
          {/* 第一个波浪球 - 主要波浪 */}
          <Box
            sx={{
              position: 'absolute',
              top: `${getWaveOffset()}px`,
              left: '-40%',
              width: '180%',
              height: '60px',
              backgroundColor: alpha('#ffffff', 0.4),
              borderRadius: '50%',
              animation: `${waveMove1} 3s ease-in-out infinite`,
            }}
          />

          {/* 第二个波浪球 - 副波浪 */}
          <Box
            sx={{
              position: 'absolute',
              top: `${getWaveOffset() + 5}px`,
              left: '-35%',
              width: '170%',
              height: '50px',
              backgroundColor: alpha('#ffffff', 0.3),
              borderRadius: '50%',
              animation: `${waveMove2} 2.5s ease-in-out infinite reverse`,
            }}
          />

          {/* 第三个波浪球 - 细节波浪 */}
          <Box
            sx={{
              position: 'absolute',
              top: `${getWaveOffset() - 3}px`,
              left: '-30%',
              width: '160%',
              height: '40px',
              backgroundColor: alpha('#ffffff', 0.2),
              borderRadius: '50%',
              animation: `${waveMove3} 4s ease-in-out infinite`,
            }}
          />
        </>
      )}

      {fillHeight === 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: '70%',
            left: '-40%',
            width: '180%',
            height: '60px',
            backgroundColor: alpha(getBgColor(), 0.3),
            borderRadius: '50%',
            animation: `${waveMove1} 4s ease-in-out infinite`,
          }}
        />
      )}

      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
        }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 'bold',
            color: 'text.primary',
            fontSize: '0.85rem',
          }}>
          {percentage}%
        </Typography>
      </Box>
    </Box>
  );
}

interface CreditsBalanceProps {
  data?: UserInfoResult;
}

export function CreditsBalance({ data = undefined as UserInfoResult | undefined }: CreditsBalanceProps) {
  const { t } = useLocaleContext();
  const { session, connectApi } = useSessionContext();
  const { creditBalance, paymentLink, currency, profileLink } = data || {};

  const overDue = Number(creditBalance?.pendingCredit) > 0;
  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;
  const balance = Number(creditBalance?.balance || 0);
  const total = Number(creditBalance?.total || 0);

  const renderBalance = () => {
    if (!isCreditBillingEnabled) {
      return (
        <Typography variant="h1" sx={{ fontWeight: 'bold', color: 'success.main' }}>
          {t('analytics.noLimit')}
        </Typography>
      );
    }

    const isNegative = balance < 0;

    if (overDue) {
      return (
        <Typography variant="h1" sx={{ fontWeight: 'bold', mb: 1, color: 'error.main' }}>
          - {formatNumber(creditBalance?.pendingCredit || 0)}
        </Typography>
      );
    }
    return (
      <Typography
        variant="h1"
        sx={{
          fontWeight: 'bold',
          mb: 1,
          color: isNegative ? 'error.main' : 'text.primary',
        }}>
        {isNegative ? '- ' : ''}
        {formatNumber(Math.abs(balance))}
      </Typography>
    );
  };

  const getBalanceStatus = () => {
    if (!isCreditBillingEnabled) return { status: 'unlimited', color: 'text.secondary' };
    if (overDue) return { status: 'overdue', color: 'error.main' };

    const percentage = getRemainingPercentage();
    if (percentage <= 10) return { status: 'critical', color: 'error.main' };
    if (percentage <= 30) return { status: 'low', color: 'warning.main' };
    return { status: 'sufficient', color: 'text.secondary' };
  };

  const getRemainingPercentage = () => {
    if (!total) return 0;

    if (Number.isNaN(balance) || Number.isNaN(total) || total <= 0) return 0;

    if (balance < 0) return 0;

    const percentage = Math.round((balance / total) * 100);
    return Math.min(100, Math.max(0, percentage));
  };

  const renderBalanceInfo = () => {
    const { status } = getBalanceStatus();

    return (
      <Stack spacing={0.5}>
        {isCreditBillingEnabled && creditBalance && total > 0 && (
          <Typography variant="caption" color="text.secondary">
            {t('analytics.usedAmount', {
              used: formatNumber(total - balance),
              total: formatNumber(total),
            })}
          </Typography>
        )}
        {status === 'overdue' && (
          <Typography variant="caption" color="error.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {t('analytics.overdueDescription')}
          </Typography>
        )}
      </Stack>
    );
  };

  const renderActionButtons = () => {
    if (!isCreditBillingEnabled) return null;

    const isUrgent = balance < 0 || overDue;

    return (
      <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
        {paymentLink && (
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
              width: 'auto',
              px: 2,
              ...(isUrgent && {
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': {
                    boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.4)',
                  },
                  '70%': {
                    boxShadow: '0 0 0 10px rgba(25, 118, 210, 0)',
                  },
                  '100%': {
                    boxShadow: '0 0 0 0 rgba(25, 118, 210, 0)',
                  },
                },
              }),
            }}>
            {t('analytics.addCredits')}
          </Button>
        )}
        {profileLink && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<Receipt />}
            onClick={() => {
              window.open(getPaymentUrl('/customer?creditTab=grants'), '_blank');
            }}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              width: 'auto',
              px: 2,
            }}>
            {t('analytics.viewBilling')}
          </Button>
        )}
      </Stack>
    );
  };

  return (
    <Stack
      sx={{
        flexDirection: {
          xs: 'column',
          md: 'row',
        },
        gap: {
          xs: 2,
          md: 2,
        },
      }}>
      <Card
        sx={{
          boxShadow: 1,
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.default',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
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
          sx={{ pb: 2 }}
        />
        <CardContent sx={{ pt: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
            {isCreditBillingEnabled && creditBalance ? <WaveChart percentage={getRemainingPercentage()} /> : null}

            <Box sx={{ flex: 1 }}>
              {renderBalance()}
              {renderBalanceInfo()}
            </Box>
          </Box>
          {renderActionButtons()}
        </CardContent>
      </Card>
      {currency && (
        <Box sx={{ flex: 1 }}>
          <SafeGuard>
            <PaymentProvider session={session} connect={connectApi}>
              <AutoTopup
                currencyId={currency.id}
                sx={{
                  '.auto-topup-content .MuiCollapse-wrapperInner': {
                    whiteSpace: 'nowrap',
                    button: {
                      display: {
                        xs: 'none',
                        md: 'flex',
                      },
                    },
                  },
                }}
              />
            </PaymentProvider>
          </SafeGuard>
        </Box>
      )}
    </Stack>
  );
}
