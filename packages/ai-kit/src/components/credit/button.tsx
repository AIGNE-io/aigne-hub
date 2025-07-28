import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { LoadingButton } from '@mui/lab';
import { Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import { withQuery } from 'ufo';

import { getCreditPaymentLink } from '../../api/app';
import withLocaleProvider from '../../utils/withLocaleProvider';

function CreditButton({
  shouldOpenInNewTab = true,
  size = 'small',
  variant = 'outlined',
  color = 'primary',
  children = null,
  useAIKitService = false,
  ...props
}: {
  shouldOpenInNewTab?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'text' | 'outlined' | 'contained';
  color?: 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  useAIKitService?: boolean;
  children?: React.ReactNode;
} & React.ComponentProps<typeof LoadingButton>) {
  const { t } = useLocaleContext();
  const [submitting, setSubmitting] = useState(false);

  const buyCredits = useCallback(async () => {
    setSubmitting(true);
    try {
      const link = await getCreditPaymentLink({
        useAIKitService,
      });
      if (link) {
        const { href } = window.location;
        const payLink = withQuery(link, {
          redirect: href,
          cancel_url: href,
        });

        if (shouldOpenInNewTab) {
          const win = window.open(payLink, '_blank');
          win?.focus();
        } else {
          window.location.href = payLink;
        }
      } else {
        Toast.error(t('creditPaymentLinkNotAvailable'));
      }
    } catch (error) {
      Toast.error(error.message || t('failedToGetCreditPaymentLink'));
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenInNewTab]);

  if (!window.blocklet?.preferences?.creditBasedBillingEnabled) {
    return null;
  }
  return (
    <LoadingButton
      onClick={buyCredits}
      size={size}
      variant={variant}
      color={color}
      type="button"
      loading={submitting}
      {...props}>
      {children || <Typography noWrap>{t('buyCredits')}</Typography>}
    </LoadingButton>
  );
}

export default withLocaleProvider(CreditButton, {
  translations: {
    en: {
      buyCredits: 'Buy Credits',
      creditPaymentLinkNotAvailable: 'Credit payment link is not available',
      failedToGetCreditPaymentLink: 'Failed to get credit payment link',
    },
    zh: {
      buyCredits: '购买额度',
      creditPaymentLinkNotAvailable: '额度付款链接不可用',
      failedToGetCreditPaymentLink: '获取额度付款链接失败',
    },
  },
});
