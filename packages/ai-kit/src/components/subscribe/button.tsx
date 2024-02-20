import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { LoadingButton } from '@mui/lab';
import { useCallback, useEffect, useState } from 'react';
import { joinURL, withQuery } from 'ufo';

import { appServiceRegister } from '../../api/app';
import { useAIKitServiceStatus } from './state';

export default function SubscribeButton({ shouldOpenInNewTab = false }: { shouldOpenInNewTab?: boolean }) {
  const { t } = useLocaleContext();
  const fetch = useAIKitServiceStatus((i) => i.fetch);
  const isSubscriptionAvailable = useAIKitServiceStatus((i) => i.computed?.isSubscriptionAvailable);
  const loading = useAIKitServiceStatus((i) => i.loading);

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
        onClick={linkToAiKit}
        size="small"
        key="button"
        variant="outlined"
        color="primary"
        type="button"
        sx={{ mx: 0.5 }}
        loading={submitting}>
        {t('subscribeAIService')}
      </LoadingButton>
    );
  }

  return null;
}
