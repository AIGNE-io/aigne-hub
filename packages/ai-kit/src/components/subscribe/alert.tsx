import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Error } from '@mui/icons-material';
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
      color="warning"
      icon={<Error />}
      {...props}
      sx={{
        px: 1,
        py: 0,
        '& .MuiAlert-message': {
          width: '100%',
        },
        ...props.sx,
      }}>
      {isUnsubscribeError && loading ? <CircularProgress size={24} /> : message}

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
      notSubscribeTip: 'Hello, in order to continue chatting, please first subscribe to AI service!',
      pastDueTip: 'Your subscription is past due, please renew your subscription!',
      notEnableAIServiceTip: 'You have not enabled the AI ​​service, switch to use AI service to continue chatting!',
      successTip: 'Your subscription has been enabled, please continue!',
    },
    zh: {
      notSubscribeTip: '你好，请订阅AI服务后继续！',
      pastDueTip: '您的订阅已过期，请续订您的订阅！',
      notEnableAIServiceTip: '您尚未启用AI服务，请切换使用AI服务继续！',
      successTip: '您的订阅已启用，请继续！',
    },
  },
});
