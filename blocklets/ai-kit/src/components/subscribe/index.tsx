import { appServiceRegister } from '@app/libs/app';
import { useAIKitServiceStatus } from '@app/pages/billing/state';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { useCallback, useEffect } from 'react';
import { joinURL, parseURL, withQuery } from 'ufo';

import LoadingButton from '../loading/loading-button';

export default function SubscribeButton({ shouldOpenInNewTab = false }: { shouldOpenInNewTab?: boolean }) {
  const { t } = useLocaleContext();
  const fetch = useAIKitServiceStatus((i) => i.fetch);
  const isSubscriptionAvailable = useAIKitServiceStatus((i) => i.computed?.isSubscriptionAvailable);
  const loading = useAIKitServiceStatus((i) => i.loading);

  const linkToAiKit = useCallback(async () => {
    try {
      const res = await appServiceRegister();
      if (res.paymentLink) {
        const { origin, href } = window.location;
        const prefix = window.blocklet?.componentMountPoints.find((i) => i.name === 'ai-kit')?.mountPoint || '/';
        const payLink = withQuery(res.paymentLink, {
          'subscription_data.description': [
            blocklet?.appName,
            blocklet?.appUrl && `<${parseURL(blocklet.appUrl).host}>`,
          ]
            .filter(Boolean)
            .join(' '),
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
    }
  }, [shouldOpenInNewTab]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  if (!loading && !isSubscriptionAvailable) {
    return (
      <LoadingButton
        onClick={linkToAiKit}
        size="small"
        key="button"
        variant="outlined"
        color="primary"
        type="button"
        sx={{ mx: 0.5 }}>
        {t('subscribeAIService')}
      </LoadingButton>
    );
  }

  return null;
}
