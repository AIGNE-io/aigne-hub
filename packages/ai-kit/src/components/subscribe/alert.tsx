import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Alert, AlertProps, CircularProgress, Stack } from '@mui/material';

import SubscribeButton from './button';
import { SubscriptionErrorType } from '../../api/error';
import withLocaleProvider from '../../utils/withLocaleProvider';
import { useAIKitServiceStatus } from './state';

function SubscribeErrorAlert({ error, ...props }: { error: any } & AlertProps) {
  const { t } = useLocaleContext();

  const isUnsubscribeError = error?.type === SubscriptionErrorType.UNSUBSCRIBED;

  const loading = useAIKitServiceStatus((i) => i.loading);
  const subscription = useAIKitServiceStatus((i) => i.app?.subscription);
  const useAIKitService = useAIKitServiceStatus((i) => i.app?.config?.useAIKitService);

  const isPastDue = subscription?.status === 'past_due';

  const message = !isUnsubscribeError
    ? error.message
    : !subscription
      ? t('notSubscribeTip')
      : isPastDue
        ? t('pastDueTip')
        : !useAIKitService
          ? t('notEnableAIServiceTip')
          : t('successTip');

  return (
    <Alert
      severity={isUnsubscribeError && subscription && useAIKitService ? 'info' : 'warning'}
      {...props}
      sx={{
        px: 1,
        py: 0,
        '& .MuiAlert-message': {
          width: '100%',
        },
        ...props.sx,
      }}>
      {isUnsubscribeError && loading ? <CircularProgress size={18} /> : message}

      {isUnsubscribeError && (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <SubscribeButton shouldOpenInNewTab showUseAIServiceButton />
        </Stack>
      )}
    </Alert>
  );
}

export default withLocaleProvider(SubscribeErrorAlert, {
  translations: {
    en: {
      notSubscribeTip: 'Hello, please subscribe to AI service first!',
      pastDueTip: 'Your AI service has expired, please renew it first!',
      notEnableAIServiceTip: 'You have not enabled AI service, please enable AI service first!',
      successTip: 'Congratulations, your subscription is successful!',
    },
    zh: {
      notSubscribeTip: '你好，请订阅 AI 服务后继续！',
      pastDueTip: '您的 AI 服务已过期，请续订后继续！',
      notEnableAIServiceTip: '您尚未启用AI服务，请启用 AI 服务后继续！',
      successTip: '恭喜，您的订阅已生效！',
    },
  },
});
