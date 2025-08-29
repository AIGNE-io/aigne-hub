import { getPaymentUrl } from '@app/libs/env';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { UserInfoResult } from '@blocklet/aigne-hub/api/types/user';
import { formatNumber } from '@blocklet/aigne-hub/utils/util';
import { AutoTopup, PaymentProvider, SafeGuard } from '@blocklet/payment-react';
import { Add, CreditCard, Receipt } from '@mui/icons-material';
import { Box, Button, Card, CardContent, CardHeader, Stack, Typography, alpha, useTheme } from '@mui/material';
import { useEffect, useRef } from 'react';

import { useSessionContext } from '../../contexts/session';

function WaveChart({ percentage }: { percentage: number }) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const getBorderColor = () => {
    if (percentage === 0) return theme.palette.grey[100];
    if (percentage <= 10) return theme.palette.error.main;
    if (percentage <= 30) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getWaveColor = () => {
      if (percentage === 0) return theme.palette.grey[300];
      if (percentage <= 10) return theme.palette.error.main;
      if (percentage <= 30) return theme.palette.warning.main;
      return theme.palette.success.main;
    };

    const canvasSize = 80;
    const radius = canvasSize / 2;

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const animate = (timestamp: number) => {
      ctx.clearRect(0, 0, canvasSize, canvasSize);

      ctx.save();
      ctx.beginPath();
      ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
      ctx.clip();

      if (percentage > 0) {
        const waterHeight = (percentage / 100) * canvasSize;

        const amplitude = 2;
        const frequency = 0.05;

        const phase = timestamp * 0.002;
        const yOffset = canvasSize - waterHeight;

        ctx.save();
        ctx.translate(0, canvasSize);
        ctx.scale(1, -1);

        ctx.beginPath();
        for (let x = 0; x < canvasSize; x++) {
          const y = amplitude * Math.sin(frequency * x + phase) + (canvasSize - yOffset);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.lineTo(canvasSize, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, canvasSize - waterHeight, 0, canvasSize);
        const color = getWaveColor();
        gradient.addColorStop(0, alpha(color, 0.45));
        gradient.addColorStop(0.3, alpha(color, 0.35));
        gradient.addColorStop(0.7, alpha(color, 0.25));
        gradient.addColorStop(1, alpha(color, 0.15));

        ctx.fillStyle = gradient;
        ctx.fill();

        // 绘制第二层水波 - 浅色叠加效果，使用不同的时间系数
        ctx.beginPath();
        for (let x = 0; x < canvasSize; x++) {
          const y2 = 3 * Math.sin(0.06 * x - phase * 1.2) + (canvasSize - yOffset - 1);
          if (x === 0) {
            ctx.moveTo(x, y2);
          } else {
            ctx.lineTo(x, y2);
          }
        }

        ctx.lineTo(canvasSize, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();

        const lightGradient = ctx.createLinearGradient(0, canvasSize - waterHeight + 5, 0, canvasSize);
        lightGradient.addColorStop(0, alpha('#ffffff', 0.4));
        lightGradient.addColorStop(0.3, alpha('#ffffff', 0.25));
        lightGradient.addColorStop(0.8, alpha('#ffffff', 0.1));
        lightGradient.addColorStop(1, alpha('#ffffff', 0.02));

        ctx.fillStyle = lightGradient;
        ctx.fill();

        ctx.restore();
      }

      ctx.restore();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate(performance.now());

    // eslint-disable-next-line consistent-return
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [percentage, theme]);

  return (
    <Box
      sx={{
        width: 80,
        height: 80,
        position: 'relative',
        border: `1px solid ${getBorderColor()}`,
        borderRadius: '50%',
        boxShadow: 1,
        backgroundColor: theme.palette.grey[50],
      }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          pointerEvents: 'none',
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

    const percentage = Math.floor((balance / total) * 100);
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
                const url = new URL(paymentLink);
                url.searchParams.set('redirect', window.location.href);
                window.open(url.toString(), '_self');
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
              window.open(getPaymentUrl('/customer?creditTab=grants'), '_self');
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
              <AutoTopup currencyId={currency.id} />
            </PaymentProvider>
          </SafeGuard>
        </Box>
      )}
    </Stack>
  );
}
