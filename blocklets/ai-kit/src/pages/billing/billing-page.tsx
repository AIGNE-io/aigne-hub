import 'dayjs/locale/zh-cn';

import { useSessionContext } from '@app/contexts/session';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import RelativeTime from '@arcblock/ux/lib/RelativeTime';
import Toast from '@arcblock/ux/lib/Toast';
import withLocaleProvider from '@blocklet/ai-kit/utils/withLocaleProvider';
import {
  AccessAlarmRounded,
  CheckCircleOutlineRounded,
  ErrorOutlineRounded,
  MoreHorizRounded,
  OpenInNewRounded,
} from '@mui/icons-material';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { bindMenu, bindTrigger, usePopupState } from 'material-ui-popup-state/hooks';
import { useEffect, useState } from 'react';

import { useAIKitServiceStatus } from './state';

function BillingPage() {
  const { t } = useLocaleContext();
  const { app, loading, fetch } = useAIKitServiceStatus();

  useEffect(() => {
    fetch();
  }, [fetch]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Stack
            direction="row"
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <Box sx={{ width: 200, height: 32 }} />
            <Box sx={{ width: 150, height: 36 }} />
          </Stack>
          <Box sx={{ height: 400 }} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        {/* Header with AI Provider Switch */}
        <Stack
          direction="row"
          spacing={2}
          sx={{
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              {t('creditManagement')}
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary' }}>
              {t('creditManagementDescription')}
            </Typography>
          </Box>

          {app && <UseAIKitServiceSwitch />}
        </Stack>
      </Stack>
    </Container>
  );
}

function UseAIKitServiceSwitch() {
  const { t, locale } = useLocaleContext();
  const { connectApi } = useSessionContext();
  const menuState = usePopupState({ variant: 'popper' });

  const {
    app,
    computed: { isSubscriptionAvailable },
    setConfig,
    fetch,
  } = useAIKitServiceStatus();

  const cancelAt = app?.subscription?.cancel_at;
  const canCancel = app?.subscription?.cancel_at_period_end === false && isSubscriptionAvailable;
  const canRecover = app?.subscription?.cancel_at_period_end === true;

  const [updating, setUpdating] = useState<boolean | 'success' | 'error'>(false);

  if (!app) return null;

  return (
    <Stack
      sx={{
        gap: 1,
        alignItems: 'flex-end',
      }}>
      <Stack
        direction="row"
        sx={{
          overflow: 'hidden',
          alignItems: 'center',
          gap: 1,
        }}>
        <Box>{t('aiProvider')}</Box>

        <TextField
          select
          size="small"
          hiddenLabel
          defaultValue={!app.config?.useAIKitService ? 'local' : 'subscribe'}
          onChange={async (e) => {
            try {
              setUpdating(true);
              await setConfig({ useAIKitService: e.target.value === 'subscribe' });
              setUpdating('success');
              setTimeout(() => setUpdating(false), 1500);
            } catch (error) {
              setUpdating('error');
              Toast.error(error.message);
              setTimeout(() => setUpdating(false), 1500);
              throw error;
            }
          }}
          slotProps={{
            select: { autoWidth: true },
          }}>
          <MenuItem value="subscribe">{t('aiProviderSubscription')}</MenuItem>
          <MenuItem value="local">{t('aiProviderLocalAIKit')}</MenuItem>
        </TextField>

        {updating && (
          <Stack
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
              width: 24,
              height: 24,
            }}>
            {updating === true ? (
              <CircularProgress size={20} />
            ) : updating === 'success' ? (
              <CheckCircleOutlineRounded color="success" sx={{ fontSize: 24 }} />
            ) : updating === 'error' ? (
              <ErrorOutlineRounded color="error" sx={{ fontSize: 24 }} />
            ) : null}
          </Stack>
        )}

        {app.config?.useAIKitService && canCancel && isSubscriptionAvailable && (
          <>
            <IconButton {...bindTrigger(menuState)}>
              <MoreHorizRounded />
            </IconButton>

            <Menu {...bindMenu(menuState)}>
              <MenuItem
                onClick={() => {
                  menuState.close();

                  connectApi.open({
                    locale,
                    action: 'cancel-subscription-ai-service',
                    messages: {
                      title: t('unsubscribe'),
                      scan: t('unsubscribeTip'),
                      confirm: t('unsubscribe'),
                      success: `${t('cancelled')}`,
                    },
                    async onSuccess() {
                      await fetch();
                    },
                  });
                }}>
                {t('unsubscribe')}
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 2,
        }}>
        {canRecover && !!cancelAt && (
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <AccessAlarmRounded color="warning" fontSize="small" />
            <Box component="span">&nbsp;{t('unsubscribeAt')}&nbsp;</Box>
            <RelativeTime
              locale={locale}
              type="absolute"
              value={cancelAt * 1000}
              withoutSuffix={undefined}
              from={undefined}
              to={undefined}
              tz={undefined}
              relativeRange={undefined}
            />

            <Button
              sx={{ ml: 1 }}
              onClick={() =>
                connectApi.open({
                  locale,
                  action: 'recover-subscription-ai-service',
                  messages: {
                    title: t('recoverSubscription'),
                    scan: t('recoverSubscriptionTip'),
                    confirm: t('recoverSubscription'),
                    success: `${t('recoverSubscriptionSucceed')}`,
                  },
                  async onSuccess() {
                    await fetch();
                  },
                })
              }>
              {t('recoverSubscription')}
            </Button>
          </Typography>
        )}

        {app.subscriptionDetailUrl && (
          <Button component="a" href={app.subscriptionDetailUrl} target="_blank" endIcon={<OpenInNewRounded />}>
            {t('viewSubscriptionDetail')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

export default withLocaleProvider(BillingPage, {
  translations: {
    en: {
      creditManagement: 'Credit Management',
      creditManagementDescription: 'Manage your credits and view usage statistics',
      aiProvider: 'AI Provider',
      aiProviderSubscription: 'Subscription Service',
      aiProviderLocalAIKit: 'Local AIGNE Hub',
      unsubscribe: 'Unsubscribe',
      unsubscribeTip: 'Confirm to unsubscribe AI service',
      cancelled: 'Cancelled',
      unsubscribeAt: 'Will unsubscribe at',
      recoverSubscription: 'Recover Subscription',
      recoverSubscriptionTip: 'Confirm to recover subscription',
      recoverSubscriptionSucceed: 'Subscription recovered successfully',
      viewSubscriptionDetail: 'View Subscription Details',
    },
    zh: {
      creditManagement: '积分管理',
      creditManagementDescription: '管理您的积分并查看使用统计',
      aiProvider: 'AI 提供商',
      aiProviderSubscription: '订阅服务',
      aiProviderLocalAIKit: '本地 AIGNE Hub',
      unsubscribe: '取消订阅',
      unsubscribeTip: '确认取消订阅 AI 服务',
      cancelled: '已取消',
      unsubscribeAt: '将在以下时间取消订阅',
      recoverSubscription: '恢复订阅',
      recoverSubscriptionTip: '确认恢复订阅',
      recoverSubscriptionSucceed: '订阅恢复成功',
      viewSubscriptionDetail: '查看订阅详情',
    },
  },
});
