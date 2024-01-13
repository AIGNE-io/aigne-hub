import { appServiceRegister } from '@app/libs/app';
import { useAIKitServiceStatus } from '@app/pages/billing/state';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { useCallback, useEffect } from 'react';
import { withQuery } from 'ufo';

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
        if (shouldOpenInNewTab) {
          const win = window.open(withQuery(res.paymentLink, { redirect: window.location.href }), '_blank');
          win?.focus();
        } else {
          window.location.href = withQuery(res.paymentLink, { redirect: window.location.href });
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
