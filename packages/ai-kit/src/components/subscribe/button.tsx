import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { LoadingButton } from '@mui/lab';
import { Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { joinURL, withQuery } from 'ufo';

import { appServiceRegister } from '../../api/app';
import withLocaleProvider from '../../utils/withLocaleProvider';
import { useAIKitServiceStatus } from './state';

function SubscribeButton({
  shouldOpenInNewTab = false,
  showUseAIServiceButton,
}: {
  shouldOpenInNewTab?: boolean;
  showUseAIServiceButton?: boolean;
}) {
  const { t } = useLocaleContext();
  const fetch = useAIKitServiceStatus((i) => i.fetch);
  const isSubscriptionAvailable = useAIKitServiceStatus((i) => i.computed?.isSubscriptionAvailable);
  const loading = useAIKitServiceStatus((i) => i.loading);
  const setConfig = useAIKitServiceStatus((i) => i.setConfig);
  const subscription = useAIKitServiceStatus((i) => i.app?.subscription);
  const useAIKitService = useAIKitServiceStatus((i) => i.app?.config?.useAIKitService);
  const subscriptionDetailUrl = useAIKitServiceStatus((i) => i.app?.subscriptionDetailUrl);

  const isPastDue = subscription?.status === 'past_due';

  const [submitting, setSubmitting] = useState(false);

  const linkToAiKit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await appServiceRegister();
      if (res.paymentLink) {
        const { origin, href } = window.location;
        const prefix = window.blocklet?.componentMountPoints.find((i) => i.name === 'ai-kit')?.mountPoint || '/';
        const payLink = withQuery(res.paymentLink, {
          redirect: withQuery(joinURL(origin, prefix, '/api/app/client/subscription/success'), { redirect: href }),
        });

        if (shouldOpenInNewTab) {
          const win = window.open(payLink, '_blank');
          win?.focus();
        } else {
          window.location.href = payLink;
        }
      }
    } catch (error) {
      Toast.error(error.message);
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [shouldOpenInNewTab]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  if (!loading && !isSubscriptionAvailable) {
    return (
      <LoadingButton
        onClick={isPastDue && subscriptionDetailUrl ? undefined : linkToAiKit}
        href={subscriptionDetailUrl}
        size="small"
        key="button"
        variant="outlined"
        color={isPastDue ? 'error' : 'primary'}
        type="button"
        sx={{ mx: 0.5, minWidth: 0 }}
        loading={submitting}>
        <Typography noWrap>{t(isPastDue ? 'aiServicePastDue' : 'subscribeAIService')}</Typography>
      </LoadingButton>
    );
  }

  if (showUseAIServiceButton && isSubscriptionAvailable && !useAIKitService) {
    return (
      <LoadingButton
        loading={submitting}
        onClick={async () => {
          setSubmitting(true);
          try {
            await setConfig({ useAIKitService: true });
            Toast.success('Successfully changed to AI service!');
          } catch (error) {
            Toast.error(error.message);
            throw error;
          } finally {
            setSubmitting(false);
          }
        }}>
        {t('useAIService')}
      </LoadingButton>
    );
  }

  return null;
}

export default withLocaleProvider(SubscribeButton, {
  translations: {
    en: {
      subscribeAIService: 'Subscribe AI Service',
      aiServicePastDue: 'Pay for overdue AI service',
      useAIService: 'Enable AI Service',
    },
    zh: {
      subscribeAIService: '订阅 AI 服务',
      aiServicePastDue: '支付 AI 服务欠费',
      useAIService: '启用 AI 服务',
    },
  },
});
